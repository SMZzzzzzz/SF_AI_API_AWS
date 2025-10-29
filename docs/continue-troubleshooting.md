# Continue で UI に応答が表示されないときの対処手順（OpenAI 互換 API）

本ドキュメントは、VS Code/Cursor 拡張「Continue」から独自の OpenAI 互換 API を利用した際、
「ログは記録されるのに UI に応答が表示されない」問題を解決するための実装要点と手順をまとめたものです。
この内容だけをインプットしても、低レベルな LLM が実装・検証まで再現できることを目標に記述しています。

## 結論（要点）

- Continue は「厳密な OpenAI ストリーミング（SSE）チャンク形式」を要求する。
- サーバ側が `stream: true` を受けたとき、Server-Sent Events で以下の順に返す必要がある：
  1) `object: "chat.completion.chunk"` かつ `choices[0].delta.role = "assistant"` のチャンク
  2) `choices[0].delta.content` に本文を入れたチャンク（複数分割でも単一でも可）
  3) 最後に `data: [DONE]` を送信してストリームを閉じる
- 非ストリーミング（`stream: false`）の場合は通常の `chat.completion` 形式で JSON を返す。

## 依存関係と環境

- Supabase Edge Functions（Deno）
- OpenAI/Anthropic 互換プロキシ関数：`supabase/functions/llm-proxy-openai/index.ts`
- Continue 設定：`C:\Users\<USER>\.continue\config.yaml`

## Continue 側の設定例（必須点だけ）

```yaml
name: "LLM Proxy API Agent"
version: "1.0.0"
models:
  - name: "Backend Assistant"
    provider: "openai"
    model: "backend"               # 役割名や任意のモデル識別子
    apiBase: "https://<PROJECT>.supabase.co/functions/v1/llm-proxy-openai"
    apiKey: "sk-dummy-key-not-required"
    stream: true                    # ← ストリーミングを有効にする
    completionOptions:
      temperature: 0.7
      maxTokens: 2000
defaultModel: "Backend Assistant"
debug: true
verbose: true
```

ポイント:
- Continue は `config.yaml` を優先的に読む。
- `stream: true` を忘れると UI はストリームを待たず、描画されないことがある。

## サーバ（Edge Function）側の実装要点

### リクエスト入力の要点

- OpenAI 互換の `chat/completions` エンドポイントで、`stream` を受ける。
- `stream` が `true` の場合は SSE（`text/event-stream`）を返す。

### ストリーミング（SSE）レスポンス仕様（最小）

SSE では各チャンク行頭に `data: ` を付け、空行で区切る。

1) 最初のチャンク（role 告知）

```json
{
  "id": "chatcmpl_...",
  "object": "chat.completion.chunk",
  "created": 1730000000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "delta": { "role": "assistant" },
      "finish_reason": null
    }
  ]
}
```

2) 本文チャンク（本文は `choices[0].delta.content` に入れる）

```json
{
  "id": "chatcmpl_...",
  "object": "chat.completion.chunk",
  "created": 1730000000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "delta": { "content": "応答本文..." },
      "finish_reason": null
    }
  ]
}
```

3) ストリームの終端

```
data: [DONE]

```

上記が守られていない（例: 一括 JSON を `data:` で丸ごと1回だけ送る等）と、Continue は UI に描画しない。

### 参考実装（抜粋：SSE 送信部）

`supabase/functions/llm-proxy-openai/index.ts` の `stream` 分岐にて：

```ts
// ... 略 ...
if (stream) {
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache");
  headers.set("Connection", "keep-alive");

  const encoder = new TextEncoder();
  const modelForStream = openAIResponse.model || actualModel;
  const createdTs = Math.floor(Date.now() / 1000);
  const streamId = openAIResponse.id || `chatcmpl_${crypto.randomUUID()}`;

  const streamResponse = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      // 1) role 通知
      send({
        id: streamId,
        object: "chat.completion.chunk",
        created: createdTs,
        model: modelForStream,
        choices: [
          { index: 0, delta: { role: "assistant" }, finish_reason: null },
        ],
      });

      // 2) 本文チャンク
      const content = openAIResponse?.choices?.[0]?.message?.content ?? "";
      if (content) {
        send({
          id: streamId,
          object: "chat.completion.chunk",
          created: createdTs,
          model: modelForStream,
          choices: [
            { index: 0, delta: { content }, finish_reason: null },
          ],
        });
      }

      // 3) 終端
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(streamResponse, { status: 200, headers });
}
// ... 略 ...
```

## 動作確認手順

### 1) Supabase へのデプロイ

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_xxx"   # 必要に応じて設定
./supabase.exe functions deploy llm-proxy-openai
```

### 2) Continue の再起動

1. エディタを完全終了（すべてのウィンドウを閉じる）
2. タスクマネージャーで Cursor/VS Code の残プロセスがあれば終了
3. 再起動後、Continue パネルを開き、`Backend Assistant` を選択

### 3) SSE の直接確認（任意）

PowerShell の `curl` は `Invoke-WebRequest` のエイリアスで動作が異なるため、`curl.exe` を明示する。

```powershell
curl.exe -N -sS ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer sk-dummy-key-not-required" ^
  -d "{\"model\":\"backend\",\"messages\":[{\"role\":\"user\",\"content\":\"SSEテスト\"}],\"stream\":true}" ^
  https://<PROJECT>.supabase.co/functions/v1/llm-proxy-openai/chat/completions
```

期待出力：`data: { ...object: "chat.completion.chunk" ... }` が複数行、最後に `data: [DONE]`。

## よくある落とし穴と対策

- サーバが一括 JSON を `data:` で一度だけ流す → UI に表示されない。
- `choices[0].delta.content` ではなく `message.content` を返している（ストリーミング時） → 表示されない。
- `data: [DONE]` を送らない → ストリームが閉じず UI が固まる。
- PowerShell で `curl` が失敗（Headers 型エラー） → `curl.exe` を使う。
- `stream: true` を Continue 側で付け忘れ → UI に表示されない。
- OpenAI 非互換の余計なフィールドや不足（index, logprobs 等） → フィルタして標準形に合わせる。

## 付録：非ストリーミング（同期）応答の最小形

```json
{
  "id": "chatcmpl_...",
  "object": "chat.completion",
  "created": 1730000000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "本文..." },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

---

この手順に従えば、Continue で UI に応答が表示されない問題は再現なく解消できます。実装が異なる場合でも、「SSE チャンク仕様を厳密に満たす」ことを最優先に確認してください。








