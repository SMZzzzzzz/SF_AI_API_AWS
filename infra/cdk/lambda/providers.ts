import { Message } from './types';
import { readStreamLines, parseOpenAIChunk, parseAnthropicChunk, convertAnthropicToOpenAI, StreamChunk } from './stream-utils';

function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length * 0.5);
}

export async function callOpenAI(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature?: number,
  maxTokens?: number,
): Promise<any> {
  const defaultMaxTokens = 2000;
  const isGptFiveFamily = model.startsWith('gpt-5');

  const estimatedInputTokens = Math.ceil(
    messages.reduce((sum, msg) => sum + estimateTokensFromText(msg.content), 0),
  );

  const contextWindow = isGptFiveFamily ? 128_000 : 32_000;
  const requestedMaxTokens = maxTokens ?? defaultMaxTokens;
  const minTokens = isGptFiveFamily ? 4000 : 1000;
  const safeMaxTokens = Math.max(
    minTokens,
    Math.min(requestedMaxTokens, contextWindow - estimatedInputTokens - 1000),
  );

  const requestBody: Record<string, unknown> = {
    model,
    messages,
  };

  if (!isGptFiveFamily && temperature !== undefined) {
    requestBody.temperature = temperature;
  }

  if (isGptFiveFamily) {
    requestBody.max_completion_tokens = safeMaxTokens;
  } else {
    requestBody.max_tokens = safeMaxTokens;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function callAnthropic(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature?: number,
  maxTokens?: number,
): Promise<any> {
  let systemMessage: string | undefined;
  const regularMessages: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content;
    } else {
      regularMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const defaultMaxTokens = 2000;
  const contextWindow = 8192;
  const estimatedInputTokens =
    regularMessages.reduce((sum, msg) => sum + estimateTokensFromText(msg.content), 0) +
    (systemMessage ? estimateTokensFromText(systemMessage) : 0);

  const requestedMaxTokens = maxTokens ?? defaultMaxTokens;
  const safeMaxTokens = Math.max(
    1000,
    Math.min(requestedMaxTokens, contextWindow - estimatedInputTokens - 500),
  );

  const requestBody: Record<string, unknown> = {
    model,
    messages: regularMessages,
    max_tokens: safeMaxTokens,
  };

  if (systemMessage) {
    requestBody.system = systemMessage;
  }
  if (temperature !== undefined) {
    requestBody.temperature = temperature;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function callLLM(
  provider: string,
  model: string,
  messages: Message[],
  openAiKey: string,
  anthropicKey: string,
  temperature?: number,
  maxTokens?: number,
): Promise<any> {
  if (provider === 'openai') {
    if (!openAiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    return callOpenAI(openAiKey, model, messages, temperature, maxTokens);
  }

  if (provider === 'anthropic') {
    if (!anthropicKey) {
      throw new Error('Anthropic API key is not configured');
    }
    return callAnthropic(anthropicKey, model, messages, temperature, maxTokens);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

export function extractTokens(
  provider: string,
  response: any,
): { tokensIn: number; tokensOut: number } {
  if (provider === 'openai') {
    return {
      tokensIn: response?.usage?.prompt_tokens ?? 0,
      tokensOut: response?.usage?.completion_tokens ?? 0,
    };
  }

  if (provider === 'anthropic') {
    return {
      tokensIn: response?.usage?.input_tokens ?? 0,
      tokensOut: response?.usage?.output_tokens ?? 0,
    };
  }

  return { tokensIn: 0, tokensOut: 0 };
}

/**
 * Call OpenAI API with streaming support
 * Returns an async generator that yields stream chunks
 */
export async function* callOpenAIStreaming(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature?: number,
  maxTokens?: number,
): AsyncGenerator<StreamChunk, { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const defaultMaxTokens = 2000;
  const isGptFiveFamily = model.startsWith('gpt-5');

  const estimatedInputTokens = Math.ceil(
    messages.reduce((sum, msg) => sum + estimateTokensFromText(msg.content), 0),
  );

  const contextWindow = isGptFiveFamily ? 128_000 : 32_000;
  const requestedMaxTokens = maxTokens ?? defaultMaxTokens;
  const minTokens = isGptFiveFamily ? 4000 : 1000;
  const safeMaxTokens = Math.max(
    minTokens,
    Math.min(requestedMaxTokens, contextWindow - estimatedInputTokens - 1000),
  );

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true }, // Request usage in final chunk
  };

  if (!isGptFiveFamily && temperature !== undefined) {
    requestBody.temperature = temperature;
  }

  if (isGptFiveFamily) {
    requestBody.max_completion_tokens = safeMaxTokens;
  } else {
    requestBody.max_tokens = safeMaxTokens;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error('OpenAI API response has no body');
  }

  const reader = response.body.getReader();
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

  try {
    for await (const line of readStreamLines(reader)) {
      const chunk = parseOpenAIChunk(line);
      if (!chunk) {
        continue;
      }

      if (chunk.object === 'done') {
        break;
      }

      // Extract usage from final chunk
      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens ?? 0,
          completion_tokens: chunk.usage.completion_tokens ?? 0,
          total_tokens: chunk.usage.total_tokens ?? 0,
        };
      }

      yield chunk;
    }
  } finally {
    reader.releaseLock();
  }

  // Return usage if available
  return { usage };
}

/**
 * Call Anthropic API with streaming support
 * Returns an async generator that yields OpenAI-format stream chunks
 */
export async function* callAnthropicStreaming(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature?: number,
  maxTokens?: number,
): AsyncGenerator<StreamChunk, { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  let systemMessage: string | undefined;
  const regularMessages: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content;
    } else {
      regularMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const defaultMaxTokens = 2000;
  const contextWindow = 8192;
  const estimatedInputTokens =
    regularMessages.reduce((sum, msg) => sum + estimateTokensFromText(msg.content), 0) +
    (systemMessage ? estimateTokensFromText(systemMessage) : 0);

  const requestedMaxTokens = maxTokens ?? defaultMaxTokens;
  const safeMaxTokens = Math.max(
    1000,
    Math.min(requestedMaxTokens, contextWindow - estimatedInputTokens - 500),
  );

  const requestBody: Record<string, unknown> = {
    model,
    messages: regularMessages,
    max_tokens: safeMaxTokens,
    stream: true,
  };

  if (systemMessage) {
    requestBody.system = systemMessage;
  }
  if (temperature !== undefined) {
    requestBody.temperature = temperature;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Anthropic API response has no body');
  }

  const reader = response.body.getReader();
  const baseId = `chatcmpl-${Date.now()}`;
  const baseModel = model;
  const baseCreated = Math.floor(Date.now() / 1000);

  let currentEventLines: string[] = [];
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

  try {
    for await (const line of readStreamLines(reader)) {
      if (line.trim() === '') {
        // Empty line indicates end of event
        if (currentEventLines.length > 0) {
          const anthropicEvent = parseAnthropicChunk(currentEventLines);
          if (anthropicEvent) {
            const openAIChunk = convertAnthropicToOpenAI(anthropicEvent, baseId, baseModel, baseCreated);
            if (openAIChunk) {
              if (openAIChunk.object === 'done') {
                break;
              }

              // Extract usage from final chunk
              if (openAIChunk.usage) {
                usage = {
                  prompt_tokens: openAIChunk.usage.prompt_tokens ?? 0,
                  completion_tokens: openAIChunk.usage.completion_tokens ?? 0,
                  total_tokens: openAIChunk.usage.total_tokens ?? 0,
                };
              }

              yield openAIChunk;
            }
          }
        }
        currentEventLines = [];
      } else {
        currentEventLines.push(line);
      }
    }

    // Process remaining event
    if (currentEventLines.length > 0) {
      const anthropicEvent = parseAnthropicChunk(currentEventLines);
      if (anthropicEvent) {
        const openAIChunk = convertAnthropicToOpenAI(anthropicEvent, baseId, baseModel, baseCreated);
        if (openAIChunk && openAIChunk.object !== 'done') {
          if (openAIChunk.usage) {
            usage = {
              prompt_tokens: openAIChunk.usage.prompt_tokens ?? 0,
              completion_tokens: openAIChunk.usage.completion_tokens ?? 0,
              total_tokens: openAIChunk.usage.total_tokens ?? 0,
            };
          }
          yield openAIChunk;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { usage };
}

/**
 * Call LLM API with streaming support
 */
export function callLLMStreaming(
  provider: string,
  model: string,
  messages: Message[],
  openAiKey: string,
  anthropicKey: string,
  temperature?: number,
  maxTokens?: number,
): AsyncGenerator<StreamChunk, { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  if (provider === 'openai') {
    if (!openAiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    return callOpenAIStreaming(openAiKey, model, messages, temperature, maxTokens);
  }

  if (provider === 'anthropic') {
    if (!anthropicKey) {
      throw new Error('Anthropic API key is not configured');
    }
    return callAnthropicStreaming(anthropicKey, model, messages, temperature, maxTokens);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

