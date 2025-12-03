import { createHash, randomUUID } from 'crypto';
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  LambdaFunctionURLEvent,
} from 'aws-lambda';
// Note: streamifyResponse, ResponseStream, HttpResponseStream, and Context are available
// in Lambda runtime but may not be in type definitions. We'll use require() at runtime.
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { callLLM, extractTokens, callLLMStreaming } from './providers';
import { StreamChunk } from './stream-utils';
import {
  buildCorsHeaders,
  calculateCost,
  createErrorResponse,
  loadModelMap,
  maskPII,
} from './helpers';
import {
  AttachmentPayload,
  Message,
  ModelConfig,
  ModelMap,
  OpenAIRequestBody,
} from './types';

const secretsManager = new SecretsManagerClient({});
const secretCache = new Map<string, string>();
const rateLimitCache = new Map<string, number[]>();
const auditS3Client = new S3Client({});

interface EnvironmentConfig {
  bucketName: string;
  modelMapKey: string;
  allowOrigins: string[];
  rateLimitQpm: number;
  logMaskPii: boolean;
  openAiSecretName?: string;
  anthropicSecretName?: string;
  auditLogBucketName?: string;
  auditLogPrefix: string;
}

// Normalize event to support both API Gateway and Lambda Function URL
function normalizeEvent(event: APIGatewayProxyEventV2 | LambdaFunctionURLEvent): {
  requestId: string;
  method: string;
  headers: Record<string, string | undefined>;
  body: string | undefined;
  isBase64Encoded: boolean;
  path: string;
} {
  // Lambda Function URL event format
  // Lambda Function URL events have requestContext but NO apiId, routeKey, or stage
  // API Gateway events have apiId, routeKey, and stage in requestContext
  const hasApiGatewayFields = 'requestContext' in event && 
    event.requestContext && 
    typeof event.requestContext === 'object' &&
    ('apiId' in event.requestContext || 'routeKey' in event.requestContext || 'stage' in event.requestContext);
  
  if ('requestContext' in event && !hasApiGatewayFields) {
    const funcUrlEvent = event as LambdaFunctionURLEvent;
    return {
      requestId: funcUrlEvent.requestContext.requestId,
      method: funcUrlEvent.requestContext.http.method,
      headers: funcUrlEvent.headers || {},
      body: funcUrlEvent.body,
      isBase64Encoded: funcUrlEvent.isBase64Encoded || false,
      path: funcUrlEvent.requestContext.http.path,
    };
  }
  
  // API Gateway HTTP API v2 event format
  const apiGwEvent = event as APIGatewayProxyEventV2;
  return {
    requestId: apiGwEvent.requestContext.requestId,
    method: apiGwEvent.requestContext.http.method,
    headers: apiGwEvent.headers || {},
    body: apiGwEvent.body,
    isBase64Encoded: apiGwEvent.isBase64Encoded || false,
    path: apiGwEvent.requestContext.http.path,
  };
}

// Shared request processing logic that can be used by both streaming and non-streaming handlers
interface ProcessRequestResult {
  responseBody: any;
  modelConfig: ModelConfig;
  identity: ReturnType<typeof resolveUserIdentity>;
  requestMeta: ReturnType<typeof resolveRequestMetadata>;
  attachments: AttachmentPayload[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  streamingRequested: boolean;
  sanitizedMessages: Message[];
  responseSnapshot: any;
  requestId: string;
  role: string;
}

interface ProcessRequestError {
  statusCode: number;
  errorType: string;
  errorMessage: string;
}

async function processRequest(
  normalized: ReturnType<typeof normalizeEvent>,
  event: APIGatewayProxyEventV2 | LambdaFunctionURLEvent,
  openAiBody: OpenAIRequestBody,
): Promise<{ success: true; data: ProcessRequestResult } | { success: false; error: ProcessRequestError; origin: string | undefined; allowOrigins: string[] }> {
  const requestId = normalized.requestId;
  const env = loadEnvironmentConfig();
  const origin = headerLookup(normalized.headers, 'origin');

  const messages = openAiBody.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      success: false,
      error: {
        statusCode: 400,
        errorType: 'invalid_request_error',
        errorMessage: 'messages must be a non-empty array',
      },
      origin,
      allowOrigins: env.allowOrigins,
    };
  }

  // Debug: Log all headers to verify what we're receiving (updated 2025-12-03 19:00)
  logStructured('debug_headers', {
    requestId: normalized.requestId,
    timestamp: new Date().toISOString(),
    allHeaderKeys: Object.keys(normalized.headers || {}),
    xHeaders: Object.keys(normalized.headers || {}).filter(k => k.toLowerCase().startsWith('x-')),
    xUserId: headerLookup(normalized.headers, 'x-user-id'),
    xWindowsUser: headerLookup(normalized.headers, 'x-windows-user'),
    xMachineName: headerLookup(normalized.headers, 'x-machine-name'),
    xWindowsAccount: headerLookup(normalized.headers, 'x-windows-account'),
  });
  
  const identity = resolveUserIdentity(openAiBody, normalized.headers);
  const requestMeta = resolveRequestMetadata(normalized, event);
  const attachments = collectAttachments(openAiBody);
  const modelAlias = openAiBody.model ?? 'gpt-4o';
  const role = resolveRole(modelAlias, messages, normalized.headers);

  if (!checkRateLimit(identity.userId, env.rateLimitQpm)) {
    return {
      success: false,
      error: {
        statusCode: 429,
        errorType: 'rate_limit_exceeded',
        errorMessage: `Rate limit exceeded: ${env.rateLimitQpm} requests per minute`,
      },
      origin,
      allowOrigins: env.allowOrigins,
    };
  }

  // Handle streaming requests - we support streaming via SSE emulation
  const streamingRequested = Boolean(openAiBody.stream);
  // Note: For true streaming, we'll use processRequestStreaming instead
  // This function is kept for non-streaming requests
  if (streamingRequested) {
    openAiBody.stream = false;
  }

  const modelMap = await loadModelMap(env.bucketName, env.modelMapKey);
  const modelConfig = selectModelConfig(modelMap, role);
  if (!modelConfig) {
    return {
      success: false,
      error: {
        statusCode: 400,
        errorType: 'invalid_request_error',
        errorMessage: `Invalid role: ${role}`,
      },
      origin,
      allowOrigins: env.allowOrigins,
    };
  }

  const [openAiApiKey, anthropicApiKey] = await Promise.all([
    getSecretValue(env.openAiSecretName),
    getSecretValue(env.anthropicSecretName),
  ]);

  const temperature = openAiBody.temperature;
  const maxTokens =
    openAiBody.max_completion_tokens ?? openAiBody.max_tokens ?? 2000;

  let llmResponse: any;
  try {
    llmResponse = await callLLM(
      modelConfig.provider,
      modelConfig.model,
      messages as Message[],
      openAiApiKey,
      anthropicApiKey,
      temperature,
      maxTokens,
    );
  } catch (error) {
    logStructured('llm_error', {
      requestId,
      role,
      provider: modelConfig.provider,
      model: modelConfig.model,
      error: (error as Error).message,
    });

    return {
      success: false,
      error: {
        statusCode: 502,
        errorType: 'api_error',
        errorMessage: (error as Error).message,
      },
      origin,
      allowOrigins: env.allowOrigins,
    };
  }

  const { tokensIn, tokensOut } = extractTokens(modelConfig.provider, llmResponse);
  const costUsd = calculateCost(
    modelConfig.provider,
    modelConfig.model,
    tokensIn,
    tokensOut,
  );

  const prompt = messages.map((m) => m.content).join('\n');
  const userMessages = messages.filter((m) => m.role === 'user');
  const latestUserMessage = userMessages.at(-1)?.content ?? '';

  const loggedPrompt = env.logMaskPii ? maskPII(prompt, true) : prompt;
  const loggedLatestUserMessage = env.logMaskPii
    ? maskPII(latestUserMessage, true)
    : latestUserMessage;

  const responseBody = normalizeResponse(modelConfig, llmResponse);

  const sanitizedMessages = messages.map((message) => {
    if (typeof message?.content === 'string') {
      return {
        ...message,
        content: env.logMaskPii ? maskPII(message.content, true) : message.content,
      };
    }
    return message;
  });

  const responseSnapshot = env.logMaskPii
    ? maskPII(JSON.stringify(responseBody), true)
    : responseBody;

  // Persist attachments and audit log asynchronously (don't block response)
  const attachmentPromise = persistAttachments(
    env.auditLogBucketName,
    env.auditLogPrefix,
    requestId,
    attachments,
  );

  // Start audit log persistence after attachments are ready
  const auditLogPromise = attachmentPromise.then((attachmentRefs) =>
    persistAuditRecord(
      env.auditLogBucketName,
      env.auditLogPrefix,
      requestId,
      {
        requestId,
        timestamp: new Date().toISOString(),
        role,
        provider: modelConfig.provider,
        model: modelConfig.model,
        identity,
        requestMeta,
        attachments: attachmentRefs,
        request: {
          modelAlias,
          temperature,
          maxTokens,
          streamingRequested,
          messages: sanitizedMessages,
        },
        response: responseSnapshot,
        usage: {
          tokensIn,
          tokensOut,
          costUsd,
        },
      },
    ),
  );

  // Log errors from async operations but don't block response
  attachmentPromise.catch((error) => {
    console.error('attachment_persist_error', {
      requestId,
      error: (error as Error).message,
    });
  });
  auditLogPromise.catch((error) => {
    console.error('audit_log_persist_error', {
      requestId,
      error: (error as Error).message,
    });
  });

  logStructured('chat_completion', {
    requestId,
    role,
    provider: modelConfig.provider,
    model: modelConfig.model,
    userId: identity.userId,
    userIdSource: identity.source,
    headerUserId: identity.headerUserId,
    bodyUserId: identity.bodyUserId,
    windowsUser: identity.windowsUser,
    machineName: identity.machineName,
    windowsAccount: identity.windowsAccount,
    requestMeta,
    auditLogRef: { bucket: env.auditLogBucketName ?? '', key: 'async' },
    attachments: [],
    tokensIn,
    tokensOut,
    costUsd,
    latestUserMessage: loggedLatestUserMessage,
    latestUserMessageLength: loggedLatestUserMessage.length,
    contextTailPreview: loggedPrompt.slice(Math.max(loggedPrompt.length - 200, 0)),
  });

  if (streamingRequested) {
    logStructured('streaming_emulated', {
      requestId,
      role,
      provider: modelConfig.provider,
      model: modelConfig.model,
      requestMeta,
      auditLogRef: { bucket: env.auditLogBucketName ?? '', key: 'async' },
      attachments: [],
    });
  }

  return {
    success: true,
    data: {
      responseBody,
      modelConfig,
      identity,
      requestMeta,
      attachments,
      tokensIn,
      tokensOut,
      costUsd,
      streamingRequested,
      sanitizedMessages,
      responseSnapshot,
      requestId,
      role,
    },
  };
}

/**
 * Process request with true streaming from LLM API
 * Streams chunks directly from LLM API to client while buffering for audit log
 */
async function processRequestStreaming(
  normalized: ReturnType<typeof normalizeEvent>,
  event: APIGatewayProxyEventV2 | LambdaFunctionURLEvent,
  openAiBody: OpenAIRequestBody,
  // @ts-ignore - HttpResponseStream is available in Lambda runtime
  httpResponseStream: any,
): Promise<{ success: true; data: { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } } | { success: false; error: ProcessRequestError }> {
  const requestId = normalized.requestId;
  const env = loadEnvironmentConfig();
  const origin = headerLookup(normalized.headers, 'origin');

  const messages = openAiBody.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      success: false,
      error: {
        statusCode: 400,
        errorType: 'invalid_request_error',
        errorMessage: 'messages must be a non-empty array',
      },
    };
  }

  const identity = resolveUserIdentity(openAiBody, normalized.headers);
  const requestMeta = resolveRequestMetadata(normalized, event);
  const attachments = collectAttachments(openAiBody);
  const modelAlias = openAiBody.model ?? 'gpt-4o';
  const role = resolveRole(modelAlias, messages, normalized.headers);

  if (!checkRateLimit(identity.userId, env.rateLimitQpm)) {
    return {
      success: false,
      error: {
        statusCode: 429,
        errorType: 'rate_limit_exceeded',
        errorMessage: `Rate limit exceeded: ${env.rateLimitQpm} requests per minute`,
      },
    };
  }

  const modelMap = await loadModelMap(env.bucketName, env.modelMapKey);
  const modelConfig = selectModelConfig(modelMap, role);
  if (!modelConfig) {
    return {
      success: false,
      error: {
        statusCode: 400,
        errorType: 'invalid_request_error',
        errorMessage: `Invalid role: ${role}`,
      },
    };
  }

  const [openAiApiKey, anthropicApiKey] = await Promise.all([
    getSecretValue(env.openAiSecretName),
    getSecretValue(env.anthropicSecretName),
  ]);

  const temperature = openAiBody.temperature;
  const maxTokens =
    openAiBody.max_completion_tokens ?? openAiBody.max_tokens ?? 2000;

  const tempId = `chatcmpl-${randomUUID()}`;
  const tempModel = modelConfig.model;
  const tempCreated = Math.floor(Date.now() / 1000);

  // Buffer for audit log
  let bufferedContent = '';
  let firstChunk: StreamChunk | null = null;
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

  try {
    const streamGenerator = callLLMStreaming(
      modelConfig.provider,
      modelConfig.model,
      messages as Message[],
      openAiApiKey,
      anthropicApiKey,
      temperature,
      maxTokens,
    );

    // Send initial role chunk
    httpResponseStream.write(`data: ${JSON.stringify({
      id: tempId,
      object: 'chat.completion.chunk',
      created: tempCreated,
      model: tempModel,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    })}\n\n`);
    await new Promise(resolve => setImmediate(resolve));

    // Stream chunks from LLM API
    let generatorResult: IteratorResult<StreamChunk, { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> | undefined;
    try {
      let done = false;

      while (!done) {
        generatorResult = await streamGenerator.next();
        done = generatorResult.done ?? false;

        if (generatorResult.value && 'choices' in generatorResult.value) {
          const chunk = generatorResult.value as StreamChunk;

          if (!firstChunk) {
            firstChunk = chunk;
          }

          // Extract content and buffer it
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            bufferedContent += content;
          }

          // Extract usage from final chunk
          if (chunk.usage) {
            usage = {
              prompt_tokens: chunk.usage.prompt_tokens ?? 0,
              completion_tokens: chunk.usage.completion_tokens ?? 0,
              total_tokens: chunk.usage.total_tokens ?? 0,
            };
          }

          // Forward chunk to client
          const chunkJson = JSON.stringify(chunk);
          const chunkData = `data: ${chunkJson}\n\n`;
          console.log(`Streaming chunk at ${Date.now()}: ${chunkJson.substring(0, 100)}...`);
          httpResponseStream.write(chunkData);
          // Ensure chunk is flushed before next write
          await new Promise(resolve => setImmediate(resolve));
          await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure flush
        }
      }

      // Get final usage from generator return value
      if (generatorResult && generatorResult.value && 'usage' in generatorResult.value && !('choices' in generatorResult.value)) {
        const returnValue = generatorResult.value as { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
        if (returnValue.usage) {
          usage = returnValue.usage;
        }
      }
    } finally {
      // Fallback: estimate tokens if usage not provided
      if (!usage && bufferedContent) {
        const estimatedTokens = Math.ceil(bufferedContent.length * 0.5);
        usage = {
          prompt_tokens: 0, // Will be calculated from messages
          completion_tokens: estimatedTokens,
          total_tokens: estimatedTokens,
        };
      }
    }

    // Send [DONE] marker
    httpResponseStream.write('data: [DONE]\n\n');
    await new Promise(resolve => setImmediate(resolve));

  } catch (error) {
    logStructured('llm_error', {
      requestId,
      role,
      provider: modelConfig.provider,
      model: modelConfig.model,
      error: (error as Error).message,
    });

    // Send error in stream format
    httpResponseStream.write(`data: ${JSON.stringify({
      id: tempId,
      object: 'chat.completion.chunk',
      created: tempCreated,
      model: tempModel,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: null,
      }],
      error: {
        message: (error as Error).message,
        type: 'api_error',
      },
    })}\n\n`);
    httpResponseStream.write('data: [DONE]\n\n');
    await new Promise(resolve => setImmediate(resolve));
    httpResponseStream.end();
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      success: false,
      error: {
        statusCode: 502,
        errorType: 'api_error',
        errorMessage: (error as Error).message,
      },
    };
  }

  // Build response body for audit log
  const responseBody = {
    id: firstChunk?.id ?? tempId,
    object: 'chat.completion',
    created: firstChunk?.created ?? tempCreated,
    model: firstChunk?.model ?? tempModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: bufferedContent,
        },
        finish_reason: 'stop',
      },
    ],
    usage: usage ? {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    } : undefined,
  };

  // Calculate tokens and cost
  const tokensIn = usage?.prompt_tokens ?? 0;
  const tokensOut = usage?.completion_tokens ?? 0;
  const costUsd = calculateCost(modelConfig.provider, modelConfig.model, tokensIn, tokensOut);

  // Sanitize messages for logging
  const sanitizedMessages = messages.map((message) => {
    if (env.logMaskPii) {
      return {
        ...message,
        content: env.logMaskPii ? maskPII(message.content, true) : message.content,
      };
    }
    return message;
  });

  const responseSnapshot = env.logMaskPii
    ? maskPII(JSON.stringify(responseBody), true)
    : responseBody;

  // Persist attachments and audit log asynchronously
  const attachmentPromise = persistAttachments(
    env.auditLogBucketName,
    env.auditLogPrefix,
    requestId,
    attachments,
  );

  const auditLogPromise = attachmentPromise.then((attachmentRefs) =>
    persistAuditRecord(
      env.auditLogBucketName,
      env.auditLogPrefix,
      requestId,
      {
        requestId,
        timestamp: new Date().toISOString(),
        role,
        provider: modelConfig.provider,
        model: modelConfig.model,
        identity,
        requestMeta,
        attachments: attachmentRefs,
        request: {
          modelAlias,
          temperature,
          maxTokens,
          streamingRequested: true,
          messages: sanitizedMessages,
        },
        response: responseSnapshot,
        usage: {
          tokensIn,
          tokensOut,
          costUsd,
        },
      },
    ),
  );

  // Log completion
  const latestUserMessage = messages[messages.length - 1]?.content ?? '';
  logStructured('chat_completion', {
    requestId,
    role,
    provider: modelConfig.provider,
    model: modelConfig.model,
    userId: identity.userId,
    userIdSource: identity.source,
    headerUserId: identity.headerUserId,
    bodyUserId: identity.bodyUserId,
    windowsUser: identity.windowsUser,
    machineName: identity.machineName,
    windowsAccount: identity.windowsAccount,
    requestMeta,
    auditLogRef: { bucket: env.auditLogBucketName ?? '', key: 'async' },
    attachments: [],
    tokensIn,
    tokensOut,
    costUsd,
    latestUserMessage: latestUserMessage.slice(0, 500),
    latestUserMessageLength: latestUserMessage.length,
    contextTailPreview: messages.map(m => m.content).join('\n').slice(-200),
  });

  // Don't await audit log - let it complete asynchronously
  auditLogPromise.catch((error) => {
    console.error('Failed to persist audit log:', error);
  });

  return {
    success: true,
    data: { usage },
  };
}

// Internal handler function (original implementation)
async function internalHandler(
  event: APIGatewayProxyEventV2 | LambdaFunctionURLEvent,
): Promise<APIGatewayProxyResultV2> {
  const normalized = normalizeEvent(event);
  const requestId = normalized.requestId;
  try {
    const env = loadEnvironmentConfig();
    const origin = headerLookup(normalized.headers, 'origin');

    if (normalized.method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: buildCorsHeaders(origin, env.allowOrigins),
      };
    }

    if (normalized.method !== 'POST') {
      return createErrorResponse(
        405,
        'method_not_allowed',
        'Only POST method is allowed',
        origin,
        env.allowOrigins,
      );
    }

    if (!normalized.body) {
      return createErrorResponse(
        400,
        'invalid_request_error',
        'Request body is required',
        origin,
        env.allowOrigins,
      );
    }

    const bodyText = normalized.isBase64Encoded
      ? Buffer.from(normalized.body, 'base64').toString('utf8')
      : normalized.body;

    let openAiBody: OpenAIRequestBody;
    try {
      openAiBody = JSON.parse(bodyText);
    } catch (error) {
      return createErrorResponse(
        400,
        'invalid_request_error',
        `JSON parse error: ${(error as Error).message}`,
        origin,
        env.allowOrigins,
      );
    }

    // Use shared request processing logic
    const processResult = await processRequest(normalized, event, openAiBody);
    
    if (!processResult.success) {
      return createErrorResponse(
        processResult.error.statusCode,
        processResult.error.errorType,
        processResult.error.errorMessage,
        processResult.origin || undefined,
        processResult.allowOrigins,
      );
    }

    const { responseBody, streamingRequested } = processResult.data;

    if (streamingRequested) {
      // Original implementation (kept for rollback)
      // New implementation using streamifyResponse will be handled by wrapper
      // This should not be reached when using streamifyResponse
      const sseBody = buildSseFromCompletion(responseBody);
      const sseHeaders = {
        ...buildCorsHeaders(origin, env.allowOrigins),
      };
      sseHeaders['content-type'] = 'text/event-stream';
      sseHeaders['cache-control'] = 'no-cache';
      sseHeaders.connection = 'keep-alive';

      return {
        statusCode: 200,
        headers: sseHeaders,
        body: sseBody,
      };
    }

    return {
      statusCode: 200,
      headers: buildCorsHeaders(origin, env.allowOrigins),
      body: JSON.stringify(responseBody),
    };
  } catch (error) {
    console.error('Unexpected error', {
      requestId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    return {
      statusCode: 500,
      headers: buildCorsHeaders(
        headerLookup(event.headers, 'origin'),
        parseAllowedOrigins(process.env.ALLOW_ORIGINS),
      ),
      body: JSON.stringify({
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred',
        },
      }),
    };
  }
}

function loadEnvironmentConfig(): EnvironmentConfig {
  const bucketName = process.env.S3_BUCKET_NAME;
  const modelMapKey = process.env.MODEL_MAP_KEY ?? 'config/model_map.json';
  const auditLogBucketName = process.env.AUDIT_LOG_BUCKET_NAME;
  const auditLogPrefix = process.env.AUDIT_LOG_PREFIX ?? 'audit';

  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is not set');
  }

  return {
    bucketName,
    modelMapKey,
    allowOrigins: parseAllowedOrigins(process.env.ALLOW_ORIGINS),
    rateLimitQpm: Number(process.env.RATE_LIMIT_QPM ?? '60'),
    logMaskPii: process.env.LOG_MASK_PII === 'true',
    openAiSecretName: process.env.OPENAI_SECRET_NAME,
    anthropicSecretName: process.env.ANTHROPIC_SECRET_NAME,
    auditLogBucketName,
    auditLogPrefix,
  };
}

function parseAllowedOrigins(value?: string): string[] {
  if (!value) {
    return ['https://app.cursor.sh'];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function headerLookup(headers: Record<string, string | undefined> | undefined, key: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const direct = headers[key];
  if (direct !== undefined) {
    return direct;
  }
  const lowered = key.toLowerCase();
  for (const [k, value] of Object.entries(headers)) {
    if (k.toLowerCase() === lowered) {
      return value;
    }
  }
  return undefined;
}

function resolveRole(
  requestedModel: string,
  messages: Message[],
  headers: Record<string, string | undefined> | undefined,
): string {
  let role = requestedModel;

  const normalizedModel = requestedModel.toLowerCase();
  if (normalizedModel === 'backend' || normalizedModel === 'server') {
    role = 'backend_developer';
  } else if (
    normalizedModel === 'frontend' ||
    normalizedModel.includes('frontend') ||
    normalizedModel.includes('react') ||
    normalizedModel.includes('vue') ||
    normalizedModel.includes('ui')
  ) {
    role = 'frontend_developer';
  } else if (
    normalizedModel === 'qa' ||
    normalizedModel.includes('qa') ||
    normalizedModel.includes('test')
  ) {
    role = 'qa_research';
  } else if (
    normalizedModel === 'devops' ||
    normalizedModel.includes('devops') ||
    normalizedModel.includes('infrastructure') ||
    normalizedModel.includes('deploy')
  ) {
    role = 'infrastructure';
  } else if (normalizedModel.includes('data') || normalizedModel.includes('analytics')) {
    role = 'qa_research';
  } else if (normalizedModel.includes('backend') || normalizedModel.includes('api')) {
    role = 'backend_developer';
  }

  const firstMessage = messages[0]?.content ?? '';
  const firstMessageLower = firstMessage.toLowerCase();
  if (firstMessageLower.includes('@backend') || firstMessageLower.includes('@server')) {
    role = 'backend_developer';
  } else if (
    firstMessageLower.includes('@frontend') ||
    firstMessageLower.includes('@ui') ||
    firstMessageLower.includes('@react')
  ) {
    role = 'frontend_developer';
  } else if (
    firstMessageLower.includes('@devops') ||
    firstMessageLower.includes('@infrastructure')
  ) {
    role = 'infrastructure';
  } else if (
    firstMessageLower.includes('@qa') ||
    firstMessageLower.includes('@test')
  ) {
    role = 'qa_research';
  }

  const customRole = headerLookup(headers, 'x-role');
  if (
    customRole &&
    ['backend_developer', 'frontend_developer', 'infrastructure', 'qa_research'].includes(
      customRole,
    )
  ) {
    role = customRole;
  }

  return role;
}

function selectModelConfig(modelMap: ModelMap, role: string): ModelConfig | undefined {
  return modelMap[role] ?? modelMap._default;
}

function checkRateLimit(userId: string, qpm: number): boolean {
  if (qpm <= 0) {
    return true;
  }

  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const timestamps = rateLimitCache.get(userId)?.filter((ts) => ts > oneMinuteAgo) ?? [];

  if (timestamps.length >= qpm) {
    return false;
  }

  timestamps.push(now);
  rateLimitCache.set(userId, timestamps);
  return true;
}

async function getSecretValue(secretName?: string): Promise<string> {
  if (!secretName) {
    return '';
  }

  if (secretCache.has(secretName)) {
    return secretCache.get(secretName) ?? '';
  }

  const response = await secretsManager.send(
    new GetSecretValueCommand({
      SecretId: secretName,
    }),
  );

  const value = response.SecretString ?? '';
  secretCache.set(secretName, value);
  return value;
}

function resolveUserIdentity(
  body: OpenAIRequestBody,
  headers: Record<string, string | undefined> | undefined,
): {
  userId: string;
  source: 'header' | 'body' | 'default';
  headerUserId?: string;
  bodyUserId?: string;
  windowsUser?: string;
  machineName?: string;
  windowsAccount?: string;
} {
  const headerUserId = headerLookup(headers, 'x-user-id')?.trim();
  const bodyUserId =
    typeof body.user === 'string' && body.user.trim().length > 0 ? body.user.trim() : undefined;
  const windowsUser = headerLookup(headers, 'x-windows-user')?.trim();
  const machineName = headerLookup(headers, 'x-machine-name')?.trim();
  const windowsAccount = headerLookup(headers, 'x-windows-account')?.trim();
  
  // Debug: Log header values for troubleshooting
  console.log('User identity headers:', {
    'x-user-id': headerLookup(headers, 'x-user-id'),
    'x-windows-user': headerLookup(headers, 'x-windows-user'),
    'x-machine-name': headerLookup(headers, 'x-machine-name'),
    'x-windows-account': headerLookup(headers, 'x-windows-account'),
    allHeaders: Object.keys(headers || {}).filter(k => k.toLowerCase().includes('user') || k.toLowerCase().includes('machine') || k.toLowerCase().includes('windows')),
  });

  if (headerUserId) {
    return {
      userId: headerUserId,
      source: 'header',
      headerUserId,
      bodyUserId,
      windowsUser,
      machineName,
      windowsAccount,
    };
  }

  if (bodyUserId) {
    return {
      userId: bodyUserId,
      source: 'body',
      headerUserId,
      bodyUserId,
      windowsUser,
      machineName,
      windowsAccount,
    };
  }

  return {
    userId: 'openai-user',
    source: 'default',
    headerUserId,
    bodyUserId,
    windowsUser,
    machineName,
    windowsAccount,
  };
}

function normalizeResponse(modelConfig: ModelConfig, response: any): any {
  if (modelConfig.provider === 'openai') {
    return response;
  }

  if (modelConfig.provider === 'anthropic') {
    const choiceContent = response?.content?.[0]?.text ?? '';
    const promptTokens = response?.usage?.input_tokens ?? 0;
    const completionTokens = response?.usage?.output_tokens ?? 0;

    return {
      id: response?.id ?? `chatcmpl-${crypto.randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelConfig.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: choiceContent,
          },
          finish_reason: response?.stop_reason === 'end_turn' ? 'stop' : response?.stop_reason,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
  }

  return response;
}

function logStructured(message: string, payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      message,
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  );
}

function resolveRequestMetadata(
  normalized: { headers: Record<string, string | undefined> },
  event: APIGatewayProxyEventV2 | LambdaFunctionURLEvent,
): {
  primaryIp?: string;
  forwardedFor?: string[];
  cfConnectingIp?: string;
  trueClientIp?: string;
  sourceIp?: string;
  userAgent?: string;
} {
  const forwardedForRaw = headerLookup(normalized.headers, 'x-forwarded-for');
  const forwardedFor =
    forwardedForRaw?.split(',').map((part) => part.trim()).filter(Boolean) ?? undefined;

  const cfConnectingIp = headerLookup(normalized.headers, 'cf-connecting-ip')?.trim();
  const trueClientIp = headerLookup(normalized.headers, 'true-client-ip')?.trim();
  
  // Try to get sourceIp from event (API Gateway has it, Function URL might not)
  let sourceIp: string | undefined;
  if ('requestContext' in event && 'http' in event.requestContext) {
    const apiGwEvent = event as APIGatewayProxyEventV2;
    sourceIp = apiGwEvent.requestContext.http?.sourceIp?.trim();
  }
  
  const userAgent = headerLookup(normalized.headers, 'user-agent');

  const primaryIp = forwardedFor?.[0] ?? cfConnectingIp ?? trueClientIp ?? sourceIp;

  return {
    primaryIp,
    forwardedFor,
    cfConnectingIp,
    trueClientIp,
    sourceIp,
    userAgent,
  };
}

function collectAttachments(body: OpenAIRequestBody): AttachmentPayload[] {
  const bodyLevel = Array.isArray(body.attachments) ? body.attachments : [];
  const messageLevel =
    body.messages?.flatMap((message) =>
      Array.isArray(message.attachments) ? message.attachments : [],
    ) ?? [];

  return [...bodyLevel, ...messageLevel]
    .filter(
      (attachment): attachment is AttachmentPayload =>
        Boolean(attachment) && typeof attachment.name === 'string',
    )
    .map((attachment) => ({
      name: attachment.name,
      mime_type: attachment.mime_type,
      data: typeof attachment.data === 'string' ? attachment.data : undefined,
    }));
}

async function persistAuditRecord(
  bucketName: string | undefined,
  prefix: string,
  requestId: string,
  record: Record<string, unknown>,
): Promise<{ bucket: string; key: string; eTag?: string } | undefined> {
  if (!bucketName) {
    return undefined;
  }

  const key = buildAuditObjectKey(prefix, requestId);

  try {
    const result = await auditS3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: JSON.stringify(record),
        ContentType: 'application/json',
      }),
    );

    return {
      bucket: bucketName,
      key,
      eTag: result.ETag,
    };
  } catch (error) {
    console.error('audit_log_persist_failed', {
      bucket: bucketName,
      key,
      error: (error as Error).message,
    });
    return undefined;
  }
}

function buildAuditObjectKey(prefix: string, requestId: string): string {
  const safePrefix = prefix.replace(/^\/*/, '').replace(/\/*$/, '') || 'audit';
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('/');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const sanitizedRequestId = requestId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safePrefix}/${datePath}/${timestamp}_${sanitizedRequestId}.json`;
}

async function persistAttachments(
  bucketName: string | undefined,
  prefix: string,
  requestId: string,
  attachments: AttachmentPayload[],
): Promise<
  Array<{ name: string; mimeType?: string; size?: number; key?: string; sha256?: string; stored: boolean }>
> {
  if (attachments.length === 0) {
    return [];
  }

  const safeBucket = bucketName;
  const attachmentPrefix = `${prefix.replace(/^\/*/, '').replace(/\/*$/, '') || 'audit'}/attachments`;

  return Promise.all(
    attachments.map(async (attachment, index) => {
      const base = {
        name: attachment.name,
        mimeType: attachment.mime_type,
      };

      if (!safeBucket || !attachment.data) {
        return {
          ...base,
          stored: false,
        };
      }

      try {
        const buffer = Buffer.from(attachment.data, 'base64');
        const sha256 = createHash('sha256').update(buffer).digest('hex');
        const key = buildAttachmentObjectKey(
          attachmentPrefix,
          requestId,
          index,
          attachment.name,
        );

        await auditS3Client.send(
          new PutObjectCommand({
            Bucket: safeBucket,
            Key: key,
            Body: buffer,
            ContentType: attachment.mime_type ?? 'application/octet-stream',
          }),
        );

        return {
          ...base,
          key,
          size: buffer.byteLength,
          sha256,
          stored: true,
        };
      } catch (error) {
        console.error('attachment_persist_failed', {
          name: attachment.name,
          error: (error as Error).message,
        });
        return {
          ...base,
          stored: false,
        };
      }
    }),
  );
}

function buildAttachmentObjectKey(
  prefix: string,
  requestId: string,
  index: number,
  fileName: string,
): string {
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('/');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const sanitizedRequestId = requestId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const sanitizedName = sanitizeFileName(fileName);
  return `${prefix}/${datePath}/${timestamp}_${sanitizedRequestId}_${index}_${sanitizedName}`;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function buildSseFromCompletion(responseBody: any): string {
  const id = responseBody?.id ?? `chatcmpl-${randomUUID()}`;
  const model = responseBody?.model ?? 'unknown-model';
  const created = responseBody?.created ?? Math.floor(Date.now() / 1000);
  const choice = responseBody?.choices?.[0] ?? {};
  const messageContent = choice?.message?.content ?? '';

  const baseChunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  });

  const chunks: string[] = [];
  chunks.push(`data: ${JSON.stringify(baseChunk({ role: 'assistant' }))}\n\n`);

  if (messageContent) {
    for (const segment of splitContent(messageContent)) {
      chunks.push(`data: ${JSON.stringify(baseChunk({ content: segment }))}\n\n`);
    }
  }

  // Final chunk with finish_reason
  chunks.push(`data: ${JSON.stringify(baseChunk({}, choice?.finish_reason ?? 'stop'))}\n\n`);
  chunks.push('data: [DONE]\n\n');

  return chunks.join('');
}

function splitContent(content: string, segmentSize = 400): string[] {
  if (content.length <= segmentSize) {
    return [content];
  }

  const segments: string[] = [];
  for (let i = 0; i < content.length; i += segmentSize) {
    segments.push(content.slice(i, i + segmentSize));
  }
  return segments;
}

// Streaming response handler using streamifyResponse
// Note: Metadata must be set BEFORE any write operations
async function sendStreamingResponse(
  responseBody: any,
  // @ts-ignore - ResponseStream is available in Lambda runtime
  responseStream: any,
  origin: string | undefined,
  allowOrigins: string[],
): Promise<void> {
  // @ts-ignore - HttpResponseStream is available in Lambda runtime
  let HttpResponseStream: any;
  try {
    HttpResponseStream = require('aws-lambda').HttpResponseStream;
  } catch {
    // @ts-ignore
    HttpResponseStream = (globalThis as any).awslambda?.HttpResponseStream;
  }

  // IMPORTANT: Metadata must be set BEFORE creating HttpResponseStream
  const metadata = {
    statusCode: 200,
    headers: {
      ...buildCorsHeaders(origin, allowOrigins),
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  };

  const httpResponseStream = HttpResponseStream.from(responseStream, metadata);

  try {
    const id = responseBody?.id ?? `chatcmpl-${randomUUID()}`;
    const model = responseBody?.model ?? 'unknown-model';
    const created = responseBody?.created ?? Math.floor(Date.now() / 1000);
    const choice = responseBody?.choices?.[0] ?? {};
    const messageContent = choice?.message?.content ?? '';

    const baseChunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: finishReason,
        },
      ],
    });

    // 1. Role notification chunk
    httpResponseStream.write(`data: ${JSON.stringify(baseChunk({ role: 'assistant' }))}\n\n`);

    // 2. Content chunks
    if (messageContent) {
      for (const segment of splitContent(messageContent)) {
        httpResponseStream.write(`data: ${JSON.stringify(baseChunk({ content: segment }))}\n\n`);
      }
    }

    // 3. Final chunk with finish_reason
    httpResponseStream.write(`data: ${JSON.stringify(baseChunk({}, choice?.finish_reason ?? 'stop'))}\n\n`);

    // 4. End marker
    httpResponseStream.write('data: [DONE]\n\n');

    // 5. End the stream
    // Note: With streamifyResponse, the handler function must remain active until the stream is complete
    // The stream will be closed when the handler function completes
    httpResponseStream.end();
    
    // Give the stream time to flush before the handler completes
    await new Promise(resolve => setImmediate(resolve));
  } catch (error) {
    console.error('Streaming error', error);
    try {
      httpResponseStream.write(`data: ${JSON.stringify({ error: { message: (error as Error).message } })}\n\n`);
      httpResponseStream.end();
      await new Promise(resolve => setImmediate(resolve));
    } catch (endError) {
      console.error('Failed to send error in stream', endError);
    }
  }
}

// Main handler with streamifyResponse wrapper
// Note: streamifyResponse is available in Lambda runtime via aws-lambda module
// We use a dynamic require at runtime to access it
let streamifyResponseFn: any;
try {
  // @ts-ignore - streamifyResponse is available in Lambda runtime
  streamifyResponseFn = require('aws-lambda').streamifyResponse;
} catch {
  // Fallback: if require fails, we'll use the function directly from global scope
  // @ts-ignore
  streamifyResponseFn = (globalThis as any).awslambda?.streamifyResponse;
}

// @ts-ignore - streamifyResponse may not be in type definitions yet
export const handler = streamifyResponseFn(
  async (
    event: APIGatewayProxyEventV2 | LambdaFunctionURLEvent,
    // @ts-ignore - ResponseStream is available in Lambda runtime
    responseStream: any,
    context: any,
  ) => {
    const normalized = normalizeEvent(event);
    const requestId = normalized.requestId;

    try {
      // Check if this is a streaming request via Lambda Function URL
      let isStreamingRequest = false;
      let openAiBody: OpenAIRequestBody | null = null;
      
      try {
        const bodyText = normalized.isBase64Encoded
          ? Buffer.from(normalized.body || '', 'base64').toString('utf8')
          : normalized.body || '';
        openAiBody = JSON.parse(bodyText);
        isStreamingRequest = Boolean(openAiBody?.stream);
      } catch {
        // If parsing fails, continue with normal flow
        openAiBody = null;
      }

      // Debug: Log event structure to verify Function URL detection
      const hasApiGatewayFields = 'requestContext' in event && 
        event.requestContext && 
        typeof event.requestContext === 'object' &&
        ('apiId' in event.requestContext || 'routeKey' in event.requestContext || 'stage' in event.requestContext);
      
      console.log('Event structure check:', {
        hasRequestContext: 'requestContext' in event,
        requestContextType: event.requestContext ? typeof event.requestContext : 'undefined',
        hasHttp: event.requestContext && 'http' in event.requestContext,
        hasApiId: event.requestContext && 'apiId' in event.requestContext,
        hasRouteKey: event.requestContext && 'routeKey' in event.requestContext,
        hasStage: event.requestContext && 'stage' in event.requestContext,
        hasApiGatewayFields,
        requestContextKeys: event.requestContext ? Object.keys(event.requestContext) : [],
      });
      
      // Lambda Function URL: has requestContext but NO apiId, routeKey, or stage
      // API Gateway: has requestContext with apiId, routeKey, and/or stage
      const isFunctionUrl = 'requestContext' in event && !hasApiGatewayFields;
      console.log('isFunctionUrl detection result:', isFunctionUrl);

      // For streaming requests via Lambda Function URL, use streaming response
      if (isStreamingRequest && isFunctionUrl && openAiBody !== null) {
        const env = loadEnvironmentConfig();
        const origin = headerLookup(normalized.headers, 'origin');

        // IMPORTANT: Start streaming response immediately to avoid timeout
        // Set up HttpResponseStream first and send initial chunk
        // @ts-ignore - HttpResponseStream is available in Lambda runtime
        let HttpResponseStream: any;
        try {
          HttpResponseStream = require('aws-lambda').HttpResponseStream;
        } catch {
          // @ts-ignore
          HttpResponseStream = (globalThis as any).awslambda?.HttpResponseStream;
        }

        const metadata = {
          statusCode: 200,
          headers: {
            ...buildCorsHeaders(origin, env.allowOrigins),
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        };

        const httpResponseStream = HttpResponseStream.from(responseStream, metadata);
        console.log('HttpResponseStream created, metadata set:', JSON.stringify(metadata));

        // Send initial role chunk immediately to start the stream
        const tempId = `chatcmpl-${randomUUID()}`;
        const tempModel = openAiBody?.model || 'unknown-model';
        const tempCreated = Math.floor(Date.now() / 1000);
        const initialChunkTime = Date.now();
        console.log('Sending initial role chunk at:', new Date(initialChunkTime).toISOString());
        httpResponseStream.write(`data: ${JSON.stringify({
          id: tempId,
          object: 'chat.completion.chunk',
          created: tempCreated,
          model: tempModel,
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })}\n\n`);
        console.log('Initial role chunk written, waiting for flush...');
        
        // Ensure the initial chunk is sent before processing
        await new Promise(resolve => setImmediate(resolve));
        console.log('Initial chunk flush completed, starting processRequestStreaming...');

        // Process request with true streaming from LLM API
        const processStartTime = Date.now();
        console.log('processRequestStreaming started at:', new Date(processStartTime).toISOString());
        const processResult = await processRequestStreaming(normalized, event, openAiBody, httpResponseStream);
        const processEndTime = Date.now();
        console.log('processRequestStreaming completed at:', new Date(processEndTime).toISOString(), 'Duration:', processEndTime - processStartTime, 'ms');
        
        if (!processResult.success) {
          // Error already sent in processRequestStreaming
          return;
        }

        // End the stream
        const endStreamTime = Date.now();
        console.log('Calling httpResponseStream.end() at:', new Date(endStreamTime).toISOString());
        httpResponseStream.end();
        // Wait longer to ensure stream is fully flushed
        await new Promise(resolve => setTimeout(resolve, 100));
        const streamCompleteTime = Date.now();
        console.log('Stream completed at:', new Date(streamCompleteTime).toISOString(), 'Total duration:', streamCompleteTime - initialChunkTime, 'ms');
        return;
      }

      // For non-streaming requests, use internal handler and convert to stream
      const result = await internalHandler(event);
      
      // internalHandler always returns APIGatewayProxyResultV2 object
      // @ts-ignore - APIGatewayProxyResultV2 type definition may be incomplete
      const resultObj = result as { statusCode: number; headers?: Record<string, string>; body?: string };
      const metadata = {
        statusCode: resultObj.statusCode || 200,
        headers: resultObj.headers || {},
      };

      // @ts-ignore - HttpResponseStream is available in Lambda runtime
      let HttpResponseStream: any;
      try {
        HttpResponseStream = require('aws-lambda').HttpResponseStream;
      } catch {
        // @ts-ignore
        HttpResponseStream = (globalThis as any).awslambda?.HttpResponseStream;
      }
      const httpResponseStream = HttpResponseStream.from(responseStream, metadata);
      httpResponseStream.write(resultObj.body || '');
      httpResponseStream.end();
    } catch (error) {
      console.error('Handler error', error);
      const normalized = normalizeEvent(event);
      const env = loadEnvironmentConfig();
      const origin = headerLookup(normalized.headers, 'origin');
      
      const errorResponse = createErrorResponse(
        500,
        'internal_server_error',
        (error as Error).message,
        origin,
        env.allowOrigins,
      );

      // @ts-ignore - APIGatewayProxyResultV2 type definition may be incomplete
      const errorResponseObj = errorResponse as { statusCode: number; headers?: Record<string, string>; body?: string };
      const metadata = {
        statusCode: errorResponseObj.statusCode,
        headers: errorResponseObj.headers || {},
      };

      // @ts-ignore - HttpResponseStream is available in Lambda runtime
      let HttpResponseStream: any;
      try {
        HttpResponseStream = require('aws-lambda').HttpResponseStream;
      } catch {
        // @ts-ignore
        HttpResponseStream = (globalThis as any).awslambda?.HttpResponseStream;
      }
      const httpResponseStream = HttpResponseStream.from(responseStream, metadata);
      httpResponseStream.write(errorResponseObj.body || '');
      httpResponseStream.end();
    }
  },
);

