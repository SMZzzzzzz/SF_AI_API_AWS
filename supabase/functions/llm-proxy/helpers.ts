/**
 * ヘルパー関数
 */

import { ErrorResponse } from "./types.ts";

/**
 * PIIマスキング（軽微な実装）
 */
export function maskPII(text: string, enabled: boolean): string {
  if (!enabled) return text;

  let masked = text;

  // メールアドレス
  masked = masked.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    "[EMAIL]"
  );

  // 電話番号（日本形式）
  masked = masked.replace(
    /\b0\d{1,4}-?\d{1,4}-?\d{4}\b/g,
    "[PHONE]"
  );

  // 連続する数字（クレジットカード等）
  masked = masked.replace(
    /\b\d{13,16}\b/g,
    "[NUMBER]"
  );

  return masked;
}

/**
 * 標準化エラーレスポンスを作成
 */
export function createErrorResponse(
  code: string,
  message: string,
  status = 400,
  origin?: string | null,
  allowedOrigins?: string
): Response {
  const errorResponse: ErrorResponse = {
    error: {
      code,
      message,
    },
  };

  // CORSヘッダーを追加
  const headers = allowedOrigins 
    ? getCorsHeaders(origin, allowedOrigins)
    : new Headers({ "Content-Type": "application/json" });

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers,
  });
}

/**
 * CORS設定を取得
 */
export function getCorsHeaders(origin: string | null, allowedOrigins: string): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  const allowed = allowedOrigins.split(",").map(o => o.trim());
  
  // 許可されたオリジンのチェック
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else if (allowed.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else {
    // デフォルトでCursorアプリを許可
    headers.set("Access-Control-Allow-Origin", "https://app.cursor.sh");
  }

  // CORS設定（ユーザーの例に基づく）
  headers.set("Access-Control-Allow-Headers", "content-type, authorization");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  
  // プリフライトリクエストのキャッシュ時間（秒）
  headers.set("Access-Control-Max-Age", "86400");

  return headers;
}

/**
 * リクエストバリデーション
 */
export function validateRequest(body: any): { valid: boolean; error?: string } {
  if (!body.role) {
    return { valid: false, error: "role is required" };
  }
  if (!body.messages || !Array.isArray(body.messages)) {
    return { valid: false, error: "messages must be an array" };
  }
  if (body.messages.length === 0) {
    return { valid: false, error: "messages cannot be empty" };
  }
  if (!body.user_id) {
    return { valid: false, error: "user_id is required" };
  }
  if (!body.project_id) {
    return { valid: false, error: "project_id is required" };
  }

  return { valid: true };
}

/**
 * model_map.jsonを取得
 */
export async function fetchModelMap(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch model_map: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching model_map:", error);
    throw error;
  }
}

/**
 * トークン数とコストを計算（簡易版）
 */
export function calculateCost(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  // 簡易的な価格設定（実際の価格は変動するため、定期的に更新が必要）
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 0.0025, output: 0.01 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "claude-3-5-sonnet-20240620": { input: 0.003, output: 0.015 },
    "claude-3-5-haiku": { input: 0.00025, output: 0.00125 },
  };

  const modelPricing = pricing[model] || { input: 0.001, output: 0.002 };
  
  // 価格は1Mトークンあたりなので、1000で割る
  const costIn = (tokensIn / 1_000_000) * modelPricing.input;
  const costOut = (tokensOut / 1_000_000) * modelPricing.output;

  return costIn + costOut;
}

