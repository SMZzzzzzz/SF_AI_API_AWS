import { Message, OpenAIRequest, AnthropicRequest } from "./types.ts";

export async function callOpenAI(
  apiKey: string,
  model: string,
  messages: Message[],
  temperature?: number,
  maxTokens?: number,
): Promise<any> {
  // max_tokensは出力の最大トークン数
  // 入力履歴を考慮すると、入力＋出力がコンテキストウィンドウを超えないようにする必要がある
  // デフォルトを2000に設定（Continue設定と合わせる）
  const defaultMaxTokens = 2000;
  
  // GPT-5系ではtemperatureとmax_tokensパラメータが特殊
  const isGPT5 = model.startsWith("gpt-5");
  
  // 入力トークン数の大まかな推定（1文字≈0.25トークン、日本語は1文字≈0.5トークン）
  const estimatedInputTokens = Math.ceil(
    messages.reduce((sum, msg) => sum + (msg.content?.length || 0) * 0.5, 0)
  );
  
  // OpenAIモデルのコンテキストウィンドウ（モデルによって異なる）
  // GPT-5系は通常128K、それ以外のGPT-4系も128K程度
  // 安全のため、gpt-5系は128K、その他は32Kとして計算
  const contextWindow = isGPT5 ? 128000 : 32000;
  
  // コンテキストウィンドウから入力トークン数を引いた値と、要求されたmaxTokensの小さい方を使用
  // GPT-5系は推論トークンも考慮して最低4000を保証
  const maxTokensWithContext = maxTokens || defaultMaxTokens;
  const minTokens = isGPT5 ? 4000 : 1000; // GPT-5系は推論トークンを考慮
  const safeMaxTokens = Math.max(
    minTokens,
    Math.min(maxTokensWithContext, contextWindow - estimatedInputTokens - 1000) // 1000トークンの安全マージン
  );
  
  console.log("OpenAI max_tokens calculation:", {
    model,
    isGPT5,
    requestedMaxTokens: maxTokens,
    defaultMaxTokens,
    estimatedInputTokens,
    contextWindow,
    safeMaxTokens,
    minTokens
  });
  
  const request: OpenAIRequest = { model, messages };
  if (temperature !== undefined && !isGPT5) {
    request.temperature = temperature;
  }
  // GPT-5系はmax_completion_tokensを使用、それ以外はmax_tokensを使用
  if (isGPT5) {
    request.max_completion_tokens = safeMaxTokens;
  } else {
    request.max_tokens = safeMaxTokens;
  }
  console.log("OpenAI request:", JSON.stringify(request, null, 2));
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
  // max_tokensは出力の最大トークン数
  // 入力履歴を考慮すると、入力＋出力がコンテキストウィンドウを超えないようにする必要がある
  // Claude Haiku 4.5は8192トークンのコンテキストウィンドウ
  // 安全のため、デフォルトを2000に設定（Continue設定と合わせる）
  const defaultMaxTokens = 2000;
  
  // 入力トークン数の大まかな推定（1文字≈0.25トークン、日本語は1文字≈0.5トークン）
  const estimatedInputTokens = Math.ceil(
    anthropicMessages.reduce((sum, msg) => sum + msg.content.length * 0.5, 0) +
    (systemMessage ? systemMessage.length * 0.5 : 0)
  );
  
  // コンテキストウィンドウ（8192）から入力トークン数を引いた値と、要求されたmaxTokensの小さい方を使用
  // ただし、最低1000トークンは保証
  const maxTokensWithContext = maxTokens || defaultMaxTokens;
  const contextWindow = 8192;
  const safeMaxTokens = Math.max(
    1000,
    Math.min(maxTokensWithContext, contextWindow - estimatedInputTokens - 500) // 500トークンの安全マージン
  );
  
  console.log("Anthropic max_tokens calculation:", {
    requestedMaxTokens: maxTokens,
    defaultMaxTokens,
    estimatedInputTokens,
    contextWindow,
    safeMaxTokens
  });
  
  const request: AnthropicRequest = {
    model,
    messages: anthropicMessages,
    max_tokens: safeMaxTokens,
  };
  if (systemMessage) request.system = systemMessage;
  if (temperature !== undefined) request.temperature = temperature;
  
  console.log("Anthropic request:", JSON.stringify(request, null, 2));
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
