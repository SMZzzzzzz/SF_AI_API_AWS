/**
 * OpenAI互換LLMルーティングAPI - Supabase Edge Function
 * 
 * エンドポイント: POST /llm-proxy-openai/chat/completions
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  LLMRequest,
  ModelConfig,
  ModelMap,
} from "../llm-proxy/types.ts";
import {
  maskPII,
  getCorsHeaders,
  fetchModelMap,
  calculateCost,
} from "../llm-proxy/helpers.ts";
import { callLLM, extractTokens } from "../llm-proxy/providers.ts";
import { saveLog } from "../llm-proxy/logger.ts";

// レート制限用のメモリキャッシュ
const rateLimitCache = new Map<string, number[]>();

/**
 * レート制限チェック
 */
function checkRateLimit(userId: string, qpm: number): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  const requests = rateLimitCache.get(userId) || [];
  const recentRequests = requests.filter((timestamp) => timestamp > oneMinuteAgo);

  if (recentRequests.length >= qpm) {
    return false;
  }

  recentRequests.push(now);
  rateLimitCache.set(userId, recentRequests);

  return true;
}

/**
 * OpenAI互換エラーレスポンス
 */
function createOpenAIErrorResponse(
  code: string,
  message: string,
  status = 400,
  origin?: string | null,
  allowedOrigins?: string
): Response {
  const errorResponse = {
    error: {
      message,
      type: code.toLowerCase().replace(/_/g, "_"),
      code,
    },
  };

  const headers = allowedOrigins 
    ? getCorsHeaders(origin, allowedOrigins)
    : new Headers({ "Content-Type": "application/json" });

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers,
  });
}

/**
 * メインハンドラー
 */
serve(async (req: Request) => {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("DATABASE_URL") || "";
  const SUPABASE_ANON_KEY =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("DATABASE_ANON_KEY") || "";
  const MODEL_MAP_URL = Deno.env.get("MODEL_MAP_URL") || "";
  const LOG_MASK_PII = Deno.env.get("LOG_MASK_PII") === "true";
  const RATE_LIMIT_QPM = parseInt(Deno.env.get("RATE_LIMIT_QPM") || "60");
  const ALLOW_ORIGINS = Deno.env.get("ALLOW_ORIGINS") || "*";

  console.log("Environment variables loaded:", {
    hasOpenAIKey: !!OPENAI_API_KEY,
    hasAnthropicKey: !!ANTHROPIC_API_KEY,
    hasSupabaseUrl: !!SUPABASE_URL,
    hasSupabaseKey: !!SUPABASE_ANON_KEY,
    modelMapUrl: MODEL_MAP_URL,
    logMaskPII: LOG_MASK_PII,
    rateLimitQPM: RATE_LIMIT_QPM,
    allowOrigins: ALLOW_ORIGINS
  });

  // Cursorからのリクエストを特別扱い（認証スキップ）
  const userAgent = req.headers.get("user-agent") || "";
  const isFromCursor = userAgent.toLowerCase().includes("cursor") || 
                       req.headers.get("origin")?.includes("cursor") ||
                       req.headers.get("referer")?.includes("cursor");

  console.log("Request details:", {
    userAgent,
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    isFromCursor
  });

  // CORS対応（プリフライトリクエスト）
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    const headers = getCorsHeaders(origin, ALLOW_ORIGINS);
    return new Response(null, { status: 204, headers });
  }

  // POSTメソッドのみ許可
  if (req.method !== "POST") {
    const origin = req.headers.get("origin");
    return createOpenAIErrorResponse("method_not_allowed", "Only POST method is allowed", 405, origin, ALLOW_ORIGINS);
  }

  try {
    // OpenAI互換リクエストボディをパース（UTF-8エンコーディング対応）
    const bodyText = await req.text();
    console.log("Raw request body:", bodyText.substring(0, 200));
    
    let openAIBody: any;
    try {
      openAIBody = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Body text:", bodyText);
      const origin = req.headers.get("origin");
      return createOpenAIErrorResponse("invalid_request_error", `JSON parse error: ${parseError.message}`, 400, origin, ALLOW_ORIGINS);
    }

    // OpenAI形式から内部形式に変換
    const model = openAIBody.model || "gpt-4o";
    const messages = openAIBody.messages || [];
    const temperature = openAIBody.temperature || 0.7;
    const max_tokens = openAIBody.max_tokens || 2000;
    
    // user_idとproject_idを生成（OpenAIリクエストにはないため）
    const user_id = openAIBody.user || "openai-user";
    const project_id = "openai-project";

    // 役割判定（複数の方法をサポート）
    let role = "backend";
    
    // 方法1: モデル名からロールを推測
    if (model.includes("frontend") || model.includes("react") || model.includes("vue") || model.includes("ui")) {
      role = "frontend";
    } else if (model.includes("devops") || model.includes("infrastructure") || model.includes("deploy")) {
      role = "devops";
    } else if (model.includes("qa") || model.includes("test") || model.includes("testing")) {
      role = "qa";
    } else if (model.includes("data") || model.includes("analytics") || model.includes("ml")) {
      role = "data";
    } else if (model.includes("backend") || model.includes("api") || model.includes("server")) {
      role = "backend";
    }
    
    // 方法2: プロンプト内の役割指示を検出
    const firstMessage = messages[0]?.content || "";
    if (firstMessage.includes("@backend") || firstMessage.includes("@server")) {
      role = "backend";
    } else if (firstMessage.includes("@frontend") || firstMessage.includes("@ui") || firstMessage.includes("@react")) {
      role = "frontend";
    } else if (firstMessage.includes("@devops") || firstMessage.includes("@infrastructure")) {
      role = "devops";
    } else if (firstMessage.includes("@qa") || firstMessage.includes("@test")) {
      role = "qa";
    } else if (firstMessage.includes("@data") || firstMessage.includes("@analytics")) {
      role = "data";
    }
    
    // 方法3: カスタムヘッダーで役割を指定（オプション）
    const customRole = req.headers.get("x-role");
    if (customRole && ["backend", "frontend", "devops", "qa", "data"].includes(customRole)) {
      role = customRole;
    }
    
    // Continueのリクエストヘッダーから役割を判定（オプション）
    const userAgent = req.headers.get("user-agent") || "";
    const isFromContinue = userAgent.toLowerCase().includes("continue") || 
                          req.headers.get("origin")?.includes("continue");
    
    if (isFromContinue) {
      console.log("Continue request detected, role:", role, "from model:", model);
    }

    // バリデーション
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      const origin = req.headers.get("origin");
      return createOpenAIErrorResponse("invalid_request_error", "messages must be a non-empty array", 400, origin, ALLOW_ORIGINS);
    }

    // レート制限チェック
    if (!checkRateLimit(user_id, RATE_LIMIT_QPM)) {
      const origin = req.headers.get("origin");
      return createOpenAIErrorResponse(
        "rate_limit_exceeded",
        `Rate limit exceeded: ${RATE_LIMIT_QPM} requests per minute`,
        429,
        origin,
        ALLOW_ORIGINS
      );
    }

    // model_map.jsonを取得
    let modelMap: ModelMap;
    try {
      modelMap = await fetchModelMap(MODEL_MAP_URL);
    } catch (error) {
      console.error("Failed to fetch model_map:", error);
      const origin = req.headers.get("origin");
      return createOpenAIErrorResponse(
        "internal_error",
        "Failed to load model configuration",
        500,
        origin,
        ALLOW_ORIGINS
      );
    }

    // ロールに対応するモデル設定を取得
    const modelConfig: ModelConfig = modelMap[role] || modelMap._default;
    if (!modelConfig) {
      const origin = req.headers.get("origin");
      return createOpenAIErrorResponse(
        "invalid_request_error",
        `Invalid role: ${role}`,
        400,
        origin,
        ALLOW_ORIGINS
      );
    }

    const { provider, model: actualModel } = modelConfig;

    console.log(`OpenAI API: model=${model} → role=${role} → ${provider}/${actualModel}`);

    // LLM APIを呼び出し
    let llmResponse: any;
    let llmError: any = null;
    try {
      llmResponse = await callLLM(
        provider,
        actualModel,
        messages,
        OPENAI_API_KEY,
        ANTHROPIC_API_KEY,
        temperature,
        max_tokens
      );
    } catch (error) {
      console.error("LLM API error:", error);
      llmError = error;
    }

    // エラーが発生した場合
    if (llmError) {
      const promptText = messages.map((m: any) => m.content).join("\n");
      const maskedPrompt = maskPII(promptText, LOG_MASK_PII);

      saveLog(SUPABASE_URL, SUPABASE_ANON_KEY, {
        user_id,
        project_id,
        provider,
        model: actualModel,
        prompt: maskedPrompt,
        response: { error: llmError.message },
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        meta: { error: true, openai_compatible: true },
      }).catch((error) => {
        console.error("Error log save error:", error);
      });

      const origin = req.headers.get("origin");
      return createOpenAIErrorResponse(
        "api_error",
        llmError instanceof Error ? llmError.message : "Failed to call LLM API",
        502,
        origin,
        ALLOW_ORIGINS
      );
    }

    // トークン数を取得
    const { tokensIn, tokensOut } = extractTokens(provider, llmResponse);

    // コストを計算
    const costUsd = calculateCost(provider, actualModel, tokensIn, tokensOut);

    // ログをマスキングして保存
    const promptText = messages.map((m: any) => m.content).join("\n");
    const maskedPrompt = maskPII(promptText, LOG_MASK_PII);

    // UTF-8エンコーディングを明示的に処理（Deno対応）
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const utf8Bytes = encoder.encode(maskedPrompt);
    const utf8Prompt = decoder.decode(utf8Bytes);

    console.log("Prompt encoding debug:", {
      original: promptText,
      masked: maskedPrompt,
      utf8: utf8Prompt,
      byteLength: utf8Bytes.length,
      charLength: maskedPrompt.length
    });

    // ログをDBに保存
    console.log("Attempting to save log:", {
      supabaseUrl: SUPABASE_URL,
      hasSupabaseKey: !!SUPABASE_ANON_KEY,
      user_id,
      project_id,
      provider,
      model: actualModel,
      promptLength: utf8Prompt.length,
      promptPreview: utf8Prompt.substring(0, 50)
    });

    saveLog(SUPABASE_URL, SUPABASE_ANON_KEY, {
      user_id,
      project_id,
      provider,
      model: actualModel,
      prompt: utf8Prompt,
      response: llmResponse,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      meta: { openai_compatible: true },
    }).then(() => {
      console.log("Log saved successfully");
    }).catch((error) => {
      console.error("Log save error:", error);
    });

    // OpenAI互換レスポンスを生成
    let openAIResponse: any;

    if (provider === "openai") {
      // OpenAIの場合はそのまま返す
      openAIResponse = llmResponse;
    } else if (provider === "anthropic") {
      // Anthropicの場合はOpenAI形式に変換
      openAIResponse = {
        id: llmResponse.id,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: actualModel,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: llmResponse.content[0].text,
            },
            finish_reason: llmResponse.stop_reason === "end_turn" ? "stop" : llmResponse.stop_reason,
          },
        ],
        usage: {
          prompt_tokens: llmResponse.usage.input_tokens,
          completion_tokens: llmResponse.usage.output_tokens,
          total_tokens: llmResponse.usage.input_tokens + llmResponse.usage.output_tokens,
        },
      };
    }

    const origin = req.headers.get("origin");
    const headers = getCorsHeaders(origin, ALLOW_ORIGINS);

    return new Response(JSON.stringify(openAIResponse), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    const origin = req.headers.get("origin");
    return createOpenAIErrorResponse(
      "internal_error",
      "An unexpected error occurred",
      500,
      origin,
      ALLOW_ORIGINS
    );
  }
});

