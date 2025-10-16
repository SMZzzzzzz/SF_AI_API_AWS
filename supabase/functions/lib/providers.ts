import { Message, OpenAIRequest, AnthropicRequest } from "./types.ts";

export async function callOpenAI(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature?: number,
  maxTokens?: number,
): Promise<any> {
  const request: OpenAIRequest = { model, messages };
  if (temperature !== undefined) request.temperature = temperature;
  if (maxTokens !== undefined) request.max_tokens = maxTokens;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
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
  const anthropicMessages: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === "system") systemMessage = msg.content;
    else anthropicMessages.push({ role: msg.role, content: msg.content });
  }
  const request: AnthropicRequest = {
    model,
    messages: anthropicMessages,
    max_tokens: maxTokens || 4096,
  };
  if (systemMessage) request.system = systemMessage;
  if (temperature !== undefined) request.temperature = temperature;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }
  return await response.json();
}

export async function callLLM(
  provider: string,
  model: string,
  messages: Message[],
  openaiKey: string,
  anthropicKey: string,
  temperature?: number,
  maxTokens?: number,
): Promise<any> {
  if (provider === "openai") return await callOpenAI(openaiKey, model, messages, temperature, maxTokens);
  if (provider === "anthropic") return await callAnthropic(anthropicKey, model, messages, temperature, maxTokens);
  throw new Error(`Unknown provider: ${provider}`);
}

export function extractTokens(provider: string, response: any): { tokensIn: number; tokensOut: number } {
  if (provider === "openai") {
    return {
      tokensIn: response.usage?.prompt_tokens || 0,
      tokensOut: response.usage?.completion_tokens || 0,
    };
  } else if (provider === "anthropic") {
    return {
      tokensIn: response.usage?.input_tokens || 0,
      tokensOut: response.usage?.output_tokens || 0,
    };
  }
  return { tokensIn: 0, tokensOut: 0 };
}
