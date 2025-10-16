/**
 * Continue用テストエンドポイント
 * 直接的なレスポンスを返す
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  console.log("Test endpoint called:", req.method, req.url);

  // CORS対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 認証ヘッダーをチェック（デバッグ用）
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header:", authHeader);
    
    // すべてのヘッダーをログ出力
    console.log("All headers:", Object.fromEntries(req.headers.entries()));

    const body = await req.json();
    console.log("Request body:", body);

    // Continueが期待する形式でレスポンスを返す
    const response = {
      id: `chatcmpl-test-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "テストメッセージを受信しました！APIは正常に動作しています。"
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    };

    console.log("Sending response:", response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
