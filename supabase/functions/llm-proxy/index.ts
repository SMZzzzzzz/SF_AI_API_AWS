/**
 * 職種別LLMルーティングAPI - Supabase Edge Function
 * 
 * エンドポイント: POST /llm-proxy
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  LLMRequest,
  LLMResponse,
  ModelConfig,
  ModelMap,
} from "./types.ts";
import {
  maskPII,
  createErrorResponse,
  getCorsHeaders,
  validateRequest,
  fetchModelMap,
  calculateCost,
} from "./helpers.ts";
import { callLLM, extractTokens } from "./providers.ts";
import { saveLog } from "./logger.ts";

// レート制限用のメモリキャッシュ（簡易実装）
const rateLimitCache = new Map<string, number[]>();

/**
 * レート制限チェック（QPM: Queries Per Minute）
 */
function checkRateLimit(userId: string, qpm: number): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  // 過去1分間のリクエストを取得
  const requests = rateLimitCache.get(userId) || [];
  const recentRequests = requests.filter((timestamp) => timestamp > oneMinuteAgo);

  if (recentRequests.length >= qpm) {
    return false; // レート制限超過
  }

  // 新しいリクエストを記録
  recentRequests.push(now);
  rateLimitCache.set(userId, recentRequests);

  return true;
}

/**
 * メインハンドラー
 */
serve(async (req: Request) => {
  // 環境変数を取得
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const SUPABASE_URL = Deno.env.get("DATABASE_URL") || "";
  const SUPABASE_ANON_KEY = Deno.env.get("DATABASE_ANON_KEY") || "";
  const MODEL_MAP_URL = Deno.env.get("MODEL_MAP_URL") || "";
  const LOG_MASK_PII = Deno.env.get("LOG_MASK_PII") === "true";
  const RATE_LIMIT_QPM = parseInt(Deno.env.get("RATE_LIMIT_QPM") || "60");
  const ALLOW_ORIGINS = Deno.env.get("ALLOW_ORIGINS") || "*";

  // CORS対応（プリフライトリクエスト）
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    const headers = getCorsHeaders(origin, ALLOW_ORIGINS);
    return new Response(null, { status: 204, headers });
  }

  // POSTメソッドのみ許可
  if (req.method !== "POST") {
    const origin = req.headers.get("origin");
    return createErrorResponse("METHOD_NOT_ALLOWED", "Only POST method is allowed", 405, origin, ALLOW_ORIGINS);
  }

  try {
    // リクエストボディをパース
    const body: LLMRequest = await req.json();

    // バリデーション
    const validation = validateRequest(body);
    if (!validation.valid) {
      const origin = req.headers.get("origin");
      return createErrorResponse("BAD_REQUEST", validation.error || "Invalid request", 400, origin, ALLOW_ORIGINS);
    }

    // レート制限チェック
    if (!checkRateLimit(body.user_id, RATE_LIMIT_QPM)) {
      const origin = req.headers.get("origin");
      return createErrorResponse(
        "RATE_LIMIT_EXCEEDED",
        `Rate limit exceeded: ${RATE_LIMIT_QPM} requests per minute`,
        429,
        origin,
        ALLOW_ORIGINS
      );
    }

    // model_map.jsonを取得
    let modelMap: ModelMap;
    try {
      console.log("MODEL_MAP_URL:", MODEL_MAP_URL);
      modelMap = await fetchModelMap(MODEL_MAP_URL);
      console.log("Model map loaded successfully:", Object.keys(modelMap));
    } catch (error) {
      console.error("Failed to fetch model_map:", error);
      console.error("MODEL_MAP_URL was:", MODEL_MAP_URL);
      const origin = req.headers.get("origin");
      return createErrorResponse(
        "INTERNAL_ERROR",
        "Failed to load model configuration",
        500,
        origin,
        ALLOW_ORIGINS
      );
    }

    // ロールに対応するモデル設定を取得
    const modelConfig: ModelConfig = modelMap[body.role] || modelMap._default;
    if (!modelConfig) {
      const origin = req.headers.get("origin");
      return createErrorResponse(
        "BAD_REQUEST",
        `Invalid role: ${body.role}`,
        400,
        origin,
        ALLOW_ORIGINS
      );
    }

    const { provider, model } = modelConfig;

    console.log(`Routing: role=${body.role} → ${provider}/${model}`);

    // LLM APIを呼び出し
    let llmResponse: any;
    let llmError: any = null;
    try {
      llmResponse = await callLLM(
        provider,
        model,
        body.messages,
        OPENAI_API_KEY,
        ANTHROPIC_API_KEY,
        body.temperature,
        body.max_tokens
      );
    } catch (error) {
      console.error("LLM API error:", error);
      llmError = error;
      // エラーでもログを保存するために、エラーレスポンスを返さない
    }

    // エラーが発生した場合
    if (llmError) {
      console.log("LLM Error detected, attempting to save log...");
      console.log("SUPABASE_URL:", SUPABASE_URL);
      console.log("SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "Set" : "Not set");
      
      // エラーログを保存
      const promptText = body.messages.map((m) => m.content).join("\n");
      const maskedPrompt = maskPII(promptText, LOG_MASK_PII);

      console.log("Attempting to save log with data:", {
        user_id: body.user_id,
        project_id: body.project_id,
        provider,
        model,
        prompt: maskedPrompt,
      });

      saveLog(SUPABASE_URL, SUPABASE_ANON_KEY, {
        user_id: body.user_id,
        project_id: body.project_id,
        provider,
        model,
        prompt: maskedPrompt,
        response: { error: llmError.message },
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        meta: { ...body.metadata, error: true },
      }).then(() => {
        console.log("Error log saved successfully");
      }).catch((error) => {
        console.error("Error log save error:", error);
      });

      const origin = req.headers.get("origin");
      return createErrorResponse(
        "LLM_API_ERROR",
        llmError instanceof Error ? llmError.message : "Failed to call LLM API",
        502,
        origin,
        ALLOW_ORIGINS
      );
    }

    // トークン数を取得
    const { tokensIn, tokensOut } = extractTokens(provider, llmResponse);

    // コストを計算
    const costUsd = calculateCost(provider, model, tokensIn, tokensOut);

    // ログをマスキングして保存
    const promptText = body.messages.map((m) => m.content).join("\n");
    const maskedPrompt = maskPII(promptText, LOG_MASK_PII);

    // ログをDBに保存（非同期・失敗しても継続）
    saveLog(SUPABASE_URL, SUPABASE_ANON_KEY, {
      user_id: body.user_id,
      project_id: body.project_id,
      provider,
      model,
      prompt: maskedPrompt,
      response: llmResponse,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      meta: body.metadata,
    }).catch((error) => {
      console.error("Log save error:", error);
    });

    // レスポンスを返却
    const response: LLMResponse = {
      provider,
      model,
      data: llmResponse,
    };

    const origin = req.headers.get("origin");
    const headers = getCorsHeaders(origin, ALLOW_ORIGINS);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    const origin = req.headers.get("origin");
    return createErrorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      500,
      origin,
      ALLOW_ORIGINS
    );
  }
});

