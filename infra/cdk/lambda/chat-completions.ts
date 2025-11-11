import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { callLLM, extractTokens } from './providers';
import {
  buildCorsHeaders,
  calculateCost,
  createErrorResponse,
  loadModelMap,
  maskPII,
} from './helpers';
import { Message, ModelConfig, ModelMap, OpenAIRequestBody } from './types';

const secretsManager = new SecretsManagerClient({});
const secretCache = new Map<string, string>();
const rateLimitCache = new Map<string, number[]>();

interface EnvironmentConfig {
  bucketName: string;
  modelMapKey: string;
  allowOrigins: string[];
  rateLimitQpm: number;
  logMaskPii: boolean;
  openAiSecretName?: string;
  anthropicSecretName?: string;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.requestContext.requestId;
  try {
    const env = loadEnvironmentConfig();
    const origin = headerLookup(event.headers, 'origin');

    if (event.requestContext.http.method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: buildCorsHeaders(origin, env.allowOrigins),
      };
    }

    if (event.requestContext.http.method !== 'POST') {
      return createErrorResponse(
        405,
        'method_not_allowed',
        'Only POST method is allowed',
        origin,
        env.allowOrigins,
      );
    }

    if (!event.body) {
      return createErrorResponse(
        400,
        'invalid_request_error',
        'Request body is required',
        origin,
        env.allowOrigins,
      );
    }

    const bodyText = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

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

    const messages = openAiBody.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return createErrorResponse(
        400,
        'invalid_request_error',
        'messages must be a non-empty array',
        origin,
        env.allowOrigins,
      );
    }

    const modelAlias = openAiBody.model ?? 'gpt-4o';
    const role = resolveRole(modelAlias, messages, event.headers);
    const userId = openAiBody.user ?? 'openai-user';

    if (!checkRateLimit(userId, env.rateLimitQpm)) {
      return createErrorResponse(
        429,
        'rate_limit_exceeded',
        `Rate limit exceeded: ${env.rateLimitQpm} requests per minute`,
        origin,
        env.allowOrigins,
      );
    }

    if (openAiBody.stream) {
      return createErrorResponse(
        501,
        'not_implemented',
        'stream=true is not yet supported on the AWS deployment',
        origin,
        env.allowOrigins,
      );
    }

    const modelMap = await loadModelMap(env.bucketName, env.modelMapKey);
    const modelConfig = selectModelConfig(modelMap, role);
    if (!modelConfig) {
      return createErrorResponse(
        400,
        'invalid_request_error',
        `Invalid role: ${role}`,
        origin,
        env.allowOrigins,
      );
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

      return createErrorResponse(
        502,
        'api_error',
        (error as Error).message,
        origin,
        env.allowOrigins,
      );
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

    logStructured('chat_completion', {
      requestId,
      role,
      provider: modelConfig.provider,
      model: modelConfig.model,
      userId,
      tokensIn,
      tokensOut,
      costUsd,
      latestUserMessage: loggedLatestUserMessage,
      latestUserMessageLength: loggedLatestUserMessage.length,
      contextTailPreview: loggedPrompt.slice(Math.max(loggedPrompt.length - 200, 0)),
    });

    const responseBody = normalizeResponse(modelConfig, llmResponse);
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

