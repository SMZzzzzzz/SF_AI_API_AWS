export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelConfig {
  provider: 'openai' | 'anthropic';
  model: string;
}

export interface ModelMap {
  [role: string]: ModelConfig;
  _default: ModelConfig;
}

export interface OpenAIRequestBody {
  model?: string;
  messages?: Message[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stream?: boolean;
  user?: string;
}

export interface CostBreakdown {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

