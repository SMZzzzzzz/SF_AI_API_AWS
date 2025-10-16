/**
 * Continue IDE用チャットエンドポイント
 * 
 * エンドポイント: POST /functions/v1/chat/completions
 * Continue IDEからのリクエストをllm-proxy-openaiに転送
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../lib/helpers.ts";

/**
 * Continueからのリクエストをllm-proxy-openaiに転送
 */
async function forwardToLLMProxy(req: Request): Promise<Response> {
  try {
    console.log("=== Continue Request Debug ===");
    console.log("Request URL:", req.url);
    console.log("Request Method:", req.method);
    console.log("Request Headers:", Object.fromEntries(req.headers.entries()));

    // リクエストボディを取得（UTF-8エンコーディング対応）
    const bodyText = await req.text();
    console.log("Raw request body:", bodyText.substring(0, 200));
    
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Body text:", bodyText);
      throw new Error(`JSON parse error: ${parseError.message}`);
    }
    
    console.log("Continue request received:", {
      model: body.model,
      messages: body.messages?.length,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      bodyKeys: Object.keys(body)
    });

    // llm-proxy-openaiエンドポイントに転送（ENV優先、なければ同一オリジンへ）
    const envTarget = Deno.env.get("LLM_PROXY_OPENAI_URL");
    const urlObj = new URL(req.url);
    const defaultTarget = `${urlObj.origin}/functions/v1/llm-proxy-openai`;
    const targetUrl = (envTarget && envTarget.trim().length > 0) ? envTarget : defaultTarget;

    console.log("Forwarding to:", targetUrl);
    
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": req.headers.get("Authorization") || "",
      },
      body: JSON.stringify(body),
    });

    console.log("Target response status:", response.status);
    console.log("Target response headers:", Object.fromEntries(response.headers.entries()));

    // レスポンスをそのまま返す
    const responseBody = await response.text();
    
    console.log("Forwarded response:", {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyLength: responseBody.length,
      bodyPreview: responseBody.substring(0, 200)
    });

    // レスポンスが有効なJSONかチェック
    try {
      const parsedResponse = JSON.parse(responseBody);
      console.log("Parsed response structure:", {
        hasId: !!parsedResponse.id,
        hasChoices: !!parsedResponse.choices,
        choicesLength: parsedResponse.choices?.length,
        hasUsage: !!parsedResponse.usage,
        firstChoice: parsedResponse.choices?.[0],
        messageContent: parsedResponse.choices?.[0]?.message?.content
      });

      // Continueが期待する形式に変換
      const continueResponse = {
        id: parsedResponse.id || `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: parsedResponse.created || Math.floor(Date.now() / 1000),
        model: parsedResponse.model || "gpt-4o",
        choices: parsedResponse.choices || [],
        usage: parsedResponse.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

      console.log("Continue formatted response:", {
        id: continueResponse.id,
        choicesLength: continueResponse.choices.length,
        messageContent: continueResponse.choices[0]?.message?.content
      });

      return new Response(JSON.stringify(continueResponse), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req.headers.get("origin"), "*"),
        },
      });

    } catch (parseError) {
      console.error("Failed to parse response as JSON:", parseError);
      
      // エラー時は元のレスポンスをそのまま返す
      return new Response(responseBody, {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req.headers.get("origin"), "*"),
        },
      });
    }

  } catch (error) {
    console.error("=== Error forwarding request ===");
    console.error("Error details:", error);
    console.error("Error stack:", error.stack);
    
    return new Response(JSON.stringify({
      error: {
        message: `Internal server error: ${error.message}`,
        type: "server_error",
        code: "internal_error",
        details: error.toString()
      }
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req.headers.get("origin"), "*"),
      },
    });
  }
}

/**
 * メインハンドラー
 */
serve(async (req: Request) => {
  const ALLOW_ORIGINS = Deno.env.get("ALLOW_ORIGINS") || "*";

  // URLパスを確認
  const url = new URL(req.url);
  const pathname = url.pathname;
  
  console.log("Request received:", {
    method: req.method,
    pathname: pathname,
    url: req.url
  });

  // Continueが期待する /chat/completions エンドポイントに対応
  if (pathname.endsWith("/chat/completions") || pathname.endsWith("/chat-completions")) {
    // CORS対応（プリフライトリクエスト）
    if (req.method === "OPTIONS") {
      const origin = req.headers.get("origin");
      const headers = getCorsHeaders(origin, ALLOW_ORIGINS);
      return new Response(null, { status: 204, headers });
    }

    // POSTメソッドのみ許可
    if (req.method !== "POST") {
      const origin = req.headers.get("origin");
      return new Response(JSON.stringify({
        error: {
          message: "Method not allowed",
          type: "invalid_request_error",
          code: "method_not_allowed"
        }
      }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin, ALLOW_ORIGINS),
        },
      });
    }

    // Continueからのリクエストを転送
    return await forwardToLLMProxy(req);
  }

  // その他のパスは404
  return new Response(JSON.stringify({
    error: {
      message: "Not Found",
      type: "invalid_request_error",
      code: "not_found"
    }
  }), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(req.headers.get("origin"), ALLOW_ORIGINS),
    },
  });
});