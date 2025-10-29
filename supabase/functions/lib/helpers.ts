/**
 * ユーティリティ関数モジュール
 * 
 * このモジュールは、エラーハンドリング、CORS対応、コスト計算など
 * API全体で共通して使用される補助機能を提供します。
 */

import { ErrorResponse } from "./types.ts";

/**
 * 個人識別情報（PII）をマスキングする
 * 
 * ログに保存する前に、センシティブな情報をマスク化します。
 * これにより、ログ分析時にプライバシーを保護できます。
 * 
 * マスク対象:
 * - メールアドレス: user@example.com → [EMAIL]
 * - 電話番号: 090-1234-5678 → [PHONE]
 * - クレジットカード番号など: 1234567890123456 → [NUMBER]
 * 
 * @param {string} text - マスク対象のテキスト
 * @param {boolean} enabled - マスキング有効フラグ
 *                            falseの場合、元のテキストがそのまま返される
 * @returns {string} マスク済みのテキスト
 * 
 * 使用例:
 *   const original = "Contact: user@example.com or 090-1234-5678";
 *   const masked = maskPII(original, true);
 *   // 結果: "Contact: [EMAIL] or [PHONE]"
 */
export function maskPII(text: string, enabled: boolean): string {
  if (!enabled) return text;
  
  let masked = text;
  
  // メールアドレスをマスク（RFC 5322準拠の簡易版）
  masked = masked.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    "[EMAIL]",
  );
  
  // 電話番号をマスク（日本の電話番号形式に対応）
  masked = masked.replace(/\b0\d{1,4}-?\d{1,4}-?\d{4}\b/g, "[PHONE]");
  
  // クレジットカード番号など13-16桁の数字をマスク
  masked = masked.replace(/\b\d{13,16}\b/g, "[NUMBER]");
  
  return masked;
}

/**
 * エラーレスポンスを作成する
 * 
 * @param {string} code - エラーコード（BAD_REQUEST, RATE_LIMIT_EXCEEDED など）
 * @param {string} message - ユーザー向けのエラーメッセージ
 * @param {number} [status=400] - HTTPステータスコード
 * @param {string|null} [origin] - リクエスト元のオリジン
 * @param {string} [allowedOrigins] - CORS許可オリジン（カンマ区切り）
 * @returns {Response} Fetchレスポンスオブジェクト
 * 
 * 使用例:
 *   return createErrorResponse(
 *     "RATE_LIMIT_EXCEEDED",
 *     "60 requests per minute exceeded",
 *     429,
 *     req.headers.get("origin"),
 *     "https://app.example.com"
 *   );
 */
export function createErrorResponse(
  code: string,
  message: string,
  status = 400,
  origin?: string | null,
  allowedOrigins?: string,
): Response {
  const errorResponse: ErrorResponse = { error: { code, message } };
  
  // CORS対応ヘッダーを設定
  const headers = allowedOrigins
    ? getCorsHeaders(origin, allowedOrigins)
    : new Headers({ "Content-Type": "application/json" });
  
  return new Response(JSON.stringify(errorResponse), { status, headers });
}

/**
 * CORS対応のレスポンスヘッダーを生成
 * 
 * クロスオリジンリクエストに対応するため、
 * 許可されたオリジンからのリクエストにはCORSヘッダーを付与します。
 * 
 * @param {string|null} origin - リクエスト元のオリジン
 * @param {string} allowedOrigins - CORS許可オリジン
 *                                  カンマ区切りで複数指定可能
 *                                  "*" で全オリジン許可
 * @returns {Headers} CORS対応ヘッダー
 * 
 * 使用例:
 *   const headers = getCorsHeaders(
 *     req.headers.get("origin"),
 *     "https://app.cursor.sh, https://app.example.com"
 *   );
 */
export function getCorsHeaders(origin: string | null, allowedOrigins: string): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  
  // 許可オリジンのリストを解析
  const allowed = allowedOrigins.split(",").map((o) => o.trim());
  
  // オリジンが許可リストに含まれるかチェック
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  // ワイルドカード許可の場合
  else if (allowed.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  // デフォルトはCursor IDEのオリジン
  else {
    headers.set("Access-Control-Allow-Origin", "https://app.cursor.sh");
  }
  
  // その他のCORSヘッダー
  headers.set("Access-Control-Allow-Headers", "content-type, authorization");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400"); // 24時間キャッシュ
  
  return headers;
}

/**
 * 外部URLからモデルマップをフェッチ
 * 
 * model_map.jsonを外部URLから取得します。
 * ネットワークエラーの場合は例外をスロー
 * 
 * @param {string} url - model_map.jsonのURL
 * @returns {Promise<any>} パースされたmodel_mapオブジェクト
 * @throws {Error} ネットワークエラーまたはHTTPエラーの場合
 * 
 * 使用例:
 *   const modelMap = await fetchModelMap(
 *     "https://example.com/model_map.json"
 *   );
 */
export async function fetchModelMap(url: string): Promise<any> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch model_map: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * LLM APIの使用コストを計算
 * 
 * トークン数と各プロバイダーの料金表に基づいて、
 * 推定コスト（USD）を計算します。
 * 
 * 料金表は定期的に更新が必要です。
 * 参考: https://openai.com/pricing, https://www.anthropic.com/pricing
 * 
 * @param {string} provider - プロバイダー名（"openai" または "anthropic"）
 * @param {string} model - モデル名
 * @param {number} tokensIn - 入力トークン数
 * @param {number} tokensOut - 出力トークン数
 * @returns {number} 推定コスト（USD）
 * 
 * 使用例:
 *   const cost = calculateCost("openai", "gpt-4o", 1000, 500);
 *   // 結果: 0.005 (USD)
 * 
 * 料金計算式:
 *   コスト = (入力トークン数 / 1,000,000) × 入力単価
 *          + (出力トークン数 / 1,000,000) × 出力単価
 */
export function calculateCost(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  // プロバイダー・モデル別の料金表（1トークンあたりのUSD）
  // 注意: 料金は変更される可能性があるため、定期的な確認が必要
  const pricing: Record<string, { input: number; output: number }> = {
    // OpenAIのモデル
    "gpt-4o": { input: 0.0025, output: 0.01 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    
    // Anthropicのモデル
    "claude-3-5-sonnet-20240620": { input: 0.003, output: 0.015 },
    "claude-3-5-haiku": { input: 0.00025, output: 0.00125 },
    "claude-3-5-haiku-20241022": { input: 0.00025, output: 0.00125 },
  };
  
  // モデルの料金を取得、未登録モデルはデフォルト料金
  const modelPricing = pricing[model] || { input: 0.001, output: 0.002 };
  
  // コストを計算（1,000,000トークン = 1M tokens単位）
  const costIn = (tokensIn / 1_000_000) * modelPricing.input;
  const costOut = (tokensOut / 1_000_000) * modelPricing.output;
  
  return costIn + costOut;
}
