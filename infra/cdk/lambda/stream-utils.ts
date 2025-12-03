// Stream parsing utilities for LLM API streaming responses

export interface StreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message: string;
    type: string;
  };
}

/**
 * Parse OpenAI SSE stream chunk
 * Format: "data: {...}\n\n"
 */
export function parseOpenAIChunk(line: string): StreamChunk | null {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const data = line.slice(6); // Remove "data: " prefix

  if (data.trim() === '[DONE]') {
    return { object: 'done' } as any;
  }

  try {
    return JSON.parse(data) as StreamChunk;
  } catch (error) {
    console.error('Failed to parse OpenAI chunk:', error, 'Line:', line);
    return null;
  }
}

/**
 * Parse Anthropic SSE stream chunk
 * Format: "event: {...}\ndata: {...}\n\n"
 */
export interface AnthropicEvent {
  type: string;
  data?: any;
}

export function parseAnthropicChunk(lines: string[]): AnthropicEvent | null {
  let eventType: string | undefined;
  let eventData: any;

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      const data = line.slice(6);
      try {
        eventData = JSON.parse(data);
      } catch (error) {
        console.error('Failed to parse Anthropic data:', error, 'Line:', line);
        return null;
      }
    }
  }

  if (!eventType) {
    return null;
  }

  return { type: eventType, data: eventData };
}

/**
 * Convert Anthropic event to OpenAI format
 */
export function convertAnthropicToOpenAI(
  event: AnthropicEvent,
  baseId: string,
  baseModel: string,
  baseCreated: number,
): StreamChunk | null {
  const { type, data } = event;

  switch (type) {
    case 'message_start':
      // Send role chunk
      return {
        id: baseId,
        object: 'chat.completion.chunk',
        created: baseCreated,
        model: baseModel,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          },
        ],
      };

    case 'content_block_delta':
      // Send content chunk
      const content = data?.delta?.text ?? '';
      if (!content) {
        return null;
      }
      return {
        id: baseId,
        object: 'chat.completion.chunk',
        created: baseCreated,
        model: baseModel,
        choices: [
          {
            index: 0,
            delta: { content },
            finish_reason: null,
          },
        ],
      };

    case 'message_delta':
      // Send final chunk with usage
      const finishReason = data?.delta?.stop_reason ?? 'stop';
      const usage = data?.usage;
      return {
        id: baseId,
        object: 'chat.completion.chunk',
        created: baseCreated,
        model: baseModel,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason,
          },
        ],
        usage: usage
          ? {
              prompt_tokens: usage.input_tokens,
              completion_tokens: usage.output_tokens,
              total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
            }
          : undefined,
      };

    case 'message_stop':
      // End of stream
      return { object: 'done' } as any;

    default:
      return null;
  }
}

/**
 * Read stream line by line
 */
export async function* readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          yield line;
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}



