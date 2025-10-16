/**
 * 型定義（共有）
 */

export interface LLMRequest {
  role: string;
  messages: Message[];
  user_id: string;
  project_id: string;
  temperature?: number;
  max_tokens?: number;
  metadata?: Record<string, any>;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelConfig {
  provider: "openai" | "anthropic";
  model: string;
}

export interface ModelMap {
  [role: string]: ModelConfig;
  _default: ModelConfig;
}

export interface LLMResponse {
  provider: string;
  model: string;
  data: any;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface LogEntry {
  user_id: string;
  project_id: string;
  provider: string;
  model: string;
  prompt: string;
  response: any;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  meta?: Record<string, any>;
}

export interface OpenAIRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
}

export interface AnthropicRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens: number;
  system?: string;
}
