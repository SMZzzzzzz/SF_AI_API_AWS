/**
 * LLM Proxy API の型定義
 * 
 * このファイルは、OpenAI互換APIとプロバイダー間のデータ構造を定義します。
 * 外部APIからのリクエスト、内部処理、ログ記録など、全体を通じて使用される型です。
 */

/**
 * クライアントからのLLMリクエスト
 * 
 * @interface LLMRequest
 * @property {string} role - LLMの役割（"backend", "frontend", "qa", "devops", "data"など）
 *                           役割に基づいて、適切なプロバイダー・モデルが選択されます
 * @property {Message[]} messages - チャット履歴。system/user/assistantのロールを含む
 * @property {string} user_id - リクエスト元ユーザーの識別子（ログ・レート制限に使用）
 * @property {string} project_id - リクエスト元プロジェクトの識別子（ログ分類に使用）
 * @property {number} [temperature] - 出力のランダム性（0.0-2.0）。低いほど確定的、高いほど創造的
 * @property {number} [max_tokens] - 最大生成トークン数。省略時はプロバイダーのデフォルト値
 * @property {Record<string, any>} [metadata] - カスタムメタデータ（ツール情報など）
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

/**
 * チャットメッセージ
 * 
 * @interface Message
 * @property {string} role - メッセージの送信者ロール
 *                          "system": 初期指示・コンテキスト
 *                          "user": ユーザーからの入力
 *                          "assistant": LLMからの応答
 * @property {string} content - メッセージの内容テキスト
 */
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * LLMモデルの設定
 * 
 * @interface ModelConfig
 * @property {string} provider - LLMプロバイダー（"openai" または "anthropic"）
 * @property {string} model - プロバイダー内の具体的なモデル名
 *                           例: "gpt-4o", "claude-3-5-sonnet-20240620"
 */
export interface ModelConfig {
  provider: "openai" | "anthropic";
  model: string;
}

/**
 * ロール別モデルマッピング
 * 
 * @interface ModelMap
 * @property {Record<string, ModelConfig>} [role] - 各ロールに対応するモデル設定
 *                                                   例: backend -> gpt-4o, frontend -> claude-haiku
 * @property {ModelConfig} _default - ロールが未定義の場合のフォールバックモデル
 * 
 * 使用例:
 * {
 *   "backend": { "provider": "openai", "model": "gpt-4o" },
 *   "frontend": { "provider": "anthropic", "model": "claude-3-5-haiku" },
 *   "_default": { "provider": "openai", "model": "gpt-4o-mini" }
 * }
 */
export interface ModelMap {
  [role: string]: ModelConfig;
  _default: ModelConfig;
}

/**
 * LLM APIからのレスポンス
 * 
 * @interface LLMResponse
 * @property {string} provider - 使用したプロバイダー名
 * @property {string} model - 使用したモデル名
 * @property {any} data - プロバイダーからの実際のレスポンスデータ
 *                        OpenAI形式またはAnthropic形式で返される
 */
export interface LLMResponse {
  provider: string;
  model: string;
  data: any;
}

/**
 * エラーレスポンス
 * 
 * @interface ErrorResponse
 * @property {object} error - エラー情報
 * @property {string} error.code - エラーコード（BAD_REQUEST, RATE_LIMIT_EXCEEDED など）
 * @property {string} error.message - ユーザー向けのエラーメッセージ
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * ログエントリ（データベース保存用）
 * 
 * @interface LogEntry
 * @property {string} user_id - リクエスト元ユーザーID
 * @property {string} project_id - リクエスト元プロジェクトID
 * @property {string} provider - 使用したLLMプロバイダー
 * @property {string} model - 使用したモデル名
 * @property {string} prompt - ユーザーのプロンプト（PII マスク済み）
 * @property {any} response - LLMからの完全なレスポンス
 * @property {number} [tokens_in] - 入力トークン数
 * @property {number} [tokens_out] - 出力トークン数
 * @property {number} [cost_usd] - 推定コスト（USD）
 * @property {Record<string, any>} [meta] - 追加メタデータ（エラー情報など）
 */
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

/**
 * OpenAI互換APIリクエスト形式
 * 
 * @interface OpenAIRequest
 * @property {string} model - モデル名
 * @property {Message[]} messages - チャット履歴
 * @property {number} [temperature] - 出力のランダム性
 * @property {number} [max_tokens] - 最大生成トークン数
 * 
 * 参考: https://platform.openai.com/docs/api-reference/chat/create
 */
export interface OpenAIRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
}

/**
 * Anthropic API リクエスト形式
 * 
 * @interface AnthropicRequest
 * @property {string} model - モデル名
 * @property {Array<{ role: string; content: string }>} messages - チャット履歴
 * @property {number} [temperature] - 出力のランダム性
 * @property {number} max_tokens - 最大生成トークン数（必須）
 * @property {string} [system] - システムプロンプト
 * 
 * 参考: https://docs.anthropic.com/claude/reference/messages-api
 */
export interface AnthropicRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens: number;
  system?: string;
}
</parameter>
</tool_tool>
</parameter>
</tool_use_instructions>

次に providers.ts にコメントを追加します：
```tool
TOOL_NAME: edit_existing_file
BEGIN_ARG: filepath
supabase/functions/lib/providers.ts
