# 文字コード問題とOpenAI互換対応の実装

## 概要

Supabase Edge Functionsを使用したLLMルーティングAPIにおいて、日本語プロンプトが「???」と表示される文字コード問題と、Cursor IDEでのOpenAI互換API対応を実装しました。

## 問題の背景

### 1. 文字コード問題
- 日本語のプロンプトがデータベースに保存される際、「???」と表示される
- UTF-8エンコーディングが正しく処理されていない
- PostgreSQLの文字コード設定とアプリケーション側の処理に不整合

### 2. OpenAI互換対応
- Cursor IDEがカスタムAPIエンドポイントを直接サポートしていない
- OpenAI互換のレスポンス形式が必要
- プリフライトリクエスト（OPTIONS）の対応が必要

## 実装内容

### 1. 文字コード問題の解決

#### 1.1 データベースレベルでの対応

**マイグレーションファイル**: `supabase/migrations/20241015000001_fix_character_encoding_only.sql`

```sql
-- 文字コード対応の修正マイグレーション
-- PostgreSQLのデフォルトはUTF-8なので、主にCollationを設定

-- データベースの文字コード確認
SELECT datname, datcollate, datctype FROM pg_database WHERE datname = current_database();

-- テーブルの文字コード設定を確認
SELECT column_name, data_type, collation_name 
FROM information_schema.columns 
WHERE table_name = 'ai_api_logs' 
AND table_schema = 'public';

-- コメント更新
COMMENT ON COLUMN public.ai_api_logs.prompt IS 'プロンプト（UTF-8エンコーディング、PIIマスキング済み）';

-- 文字コード確認用の関数（デバッグ用）
CREATE OR REPLACE FUNCTION check_encoding(text_value text) 
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object(
        'value', text_value,
        'length', length(text_value),
        'byte_length', octet_length(text_value),
        'encoding_check', case when text_value ~ '[^\x00-\x7F]' then 'contains_non_ascii' else 'ascii_only' end
    );
END;
$$ LANGUAGE plpgsql;
```

#### 1.2 Edge Functionレベルでの対応

**ファイル**: `supabase/functions/llm-proxy-openai/index.ts`

```typescript
// UTF-8エンコーディングを明示的に処理
const utf8Prompt = Buffer.from(maskedPrompt, 'utf8').toString('utf8');

console.log("Prompt encoding debug:", {
  original: promptText,
  masked: maskedPrompt,
  utf8: utf8Prompt,
  byteLength: Buffer.byteLength(maskedPrompt, 'utf8'),
  charLength: maskedPrompt.length
});
```

#### 1.3 Loggerレベルでの対応

**ファイル**: `supabase/functions/llm-proxy/logger.ts`

```typescript
// 文字コード処理：UTF-8エンコーディングを明示的に処理
const processedLogEntry = {
  ...logEntry,
  prompt: typeof logEntry.prompt === 'string' 
    ? Buffer.from(logEntry.prompt, 'utf8').toString('utf8')
    : logEntry.prompt,
  user_id: typeof logEntry.user_id === 'string'
    ? Buffer.from(logEntry.user_id, 'utf8').toString('utf8')
    : logEntry.user_id,
  // 他の文字列フィールドも同様に処理
};

console.log("Saving log with UTF-8 encoding:", {
  promptLength: processedLogEntry.prompt?.length,
  promptBytes: processedLogEntry.prompt ? Buffer.byteLength(processedLogEntry.prompt, 'utf8') : 0,
  promptPreview: processedLogEntry.prompt?.substring(0, 100)
});
```

#### 1.4 Deno設定の更新

**ファイル**: `deno.json`

```json
{
  "tasks": {
    "serve": "deno run --allow-net --allow-env --watch supabase/functions/llm-proxy/index.ts"
  },
  "compilerOptions": {
    "lib": ["deno.ns", "deno.unstable"],
    "strict": true,
    "target": "ES2022"
  },
  "fmt": {
    "charset": "utf8",
    "indentWidth": 2,
    "lineWidth": 100,
    "proseWrap": "preserve",
    "semiColons": true,
    "singleQuote": false,
    "useTabs": false
  }
}
```

### 2. OpenAI互換対応の実装

#### 2.1 新しいエンドポイントの作成

**ファイル**: `supabase/functions/llm-proxy-openai/index.ts`

OpenAI互換のリクエスト/レスポンス形式に対応した新しいエンドポイントを作成：

```typescript
/**
 * OpenAI互換LLMルーティングAPI - Supabase Edge Function
 * 
 * エンドポイント: POST /llm-proxy-openai/chat/completions
 */

// OpenAI互換リクエストボディをパース
const openAIBody: any = await req.json();

// OpenAI形式から内部形式に変換
const model = openAIBody.model || "gpt-4o";
const messages = openAIBody.messages || [];
const temperature = openAIBody.temperature || 0.7;
const max_tokens = openAIBody.max_tokens || 2000;

// user_idとproject_idを生成（OpenAIリクエストにはないため）
const user_id = openAIBody.user || "openai-user";
const project_id = "openai-project";
```

#### 2.2 レスポンス形式の変換

```typescript
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
```

#### 2.3 CORS設定の強化

```typescript
// CORS対応（プリフライトリクエスト）
if (req.method === "OPTIONS") {
  const origin = req.headers.get("origin");
  const headers = getCorsHeaders(origin, ALLOW_ORIGINS);
  return new Response(null, { status: 204, headers });
}
```

**ヘルパー関数**: `supabase/functions/llm-proxy/helpers.ts`

```typescript
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
```

### 3. 設定ファイルの更新

#### 3.1 Supabase設定

**ファイル**: `supabase/config.toml`

```toml
# Edge Functionsの設定
[functions.llm-proxy]
verify_jwt = false

[functions.llm-proxy-openai]
verify_jwt = false
```

#### 3.2 デプロイスクリプト

**ファイル**: `deploy-with-token.bat`

```batch
@echo off
echo Supabase Edge Function Deployment Script (with Token)
echo ===================================================

REM アクセストークンを設定してください
set SUPABASE_ACCESS_TOKEN=sbp_38f80795ae846a8543d04dfdc77a238a25adfecd

REM Supabase CLIのパス
set SUPABASE_CLI=.\supabase.exe

REM プロジェクト参照ID
set PROJECT_REF=ndiwsfzozeudtenshwgx

echo 1. プロジェクトにリンク...
%SUPABASE_CLI% link --project-ref %PROJECT_REF%

echo 2. Edge Functionをデプロイ...
%SUPABASE_CLI% functions deploy llm-proxy-openai

echo 3. デプロイ確認...
%SUPABASE_CLI% functions list

echo.
echo デプロイ完了！
echo エンドポイント: https://%PROJECT_REF%.supabase.co/functions/v1/llm-proxy-openai
```

## Cursor IDE設定

### 設定手順

1. **Cursor設定を開く** (`Ctrl + ,`)
2. **Override OpenAI Base URL**を以下に設定：
   ```
   https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai
   ```
3. **OpenAI API Key**を設定（または無効化）
4. **設定を保存**

### 期待される動作

- CursorからのリクエストがカスタムAPIを経由
- 日本語プロンプトが正しく処理・保存される
- OpenAI互換のレスポンス形式で応答

## デバッグ機能

### ログ出力の強化

```typescript
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

console.log("Prompt encoding debug:", {
  original: promptText,
  masked: maskedPrompt,
  utf8: utf8Prompt,
  byteLength: Buffer.byteLength(maskedPrompt, 'utf8'),
  charLength: maskedPrompt.length
});
```

## 確認方法

### 1. 文字コード確認

```sql
-- データベースで文字コード確認
SELECT check_encoding(prompt) FROM ai_api_logs ORDER BY ts DESC LIMIT 1;
```

### 2. ログ確認

- **Supabaseダッシュボード** → Edge Functions → `llm-proxy-openai` → Logs
- **Table Editor** → `ai_api_logs` テーブル

### 3. API動作確認

```bash
curl -X POST "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"日本語テスト"}],"temperature":0.7,"max_tokens":50}'
```

## トラブルシューティング

### よくある問題

1. **ログが出力されない**
   - Cursor設定のエンドポイントURLを確認
   - 環境変数が正しく設定されているか確認

2. **文字コード問題が残る**
   - データベースの文字コード設定を確認
   - Buffer.from()の処理が正しく動作しているか確認

3. **CORS エラー**
   - ALLOW_ORIGINSの設定を確認
   - プリフライトリクエストが正しく処理されているか確認

## 今後の改善点

1. **エラーハンドリングの強化**
2. **ログの構造化**
3. **パフォーマンス監視**
4. **セキュリティ強化**

## 参考リンク

- [Supabase Edge Functions ドキュメント](https://supabase.com/docs/guides/functions)
- [OpenAI API リファレンス](https://platform.openai.com/docs/api-reference)
- [PostgreSQL 文字コード設定](https://www.postgresql.org/docs/current/multibyte.html)


