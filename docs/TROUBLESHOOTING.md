# トラブルシューティングガイド

## 概要

本ドキュメントは、Continue IDE拡張機能から独自のOpenAI互換API（AWS Lambda Function URL）を利用した際に発生する問題の解決方法をまとめたものです。過去のトラブルシューティング履歴も含まれています。

## 現在の実装状況

✅ **AWS Lambda Function URL**を使用（最大15分対応）  
✅ **SSEストリーミング実装完了**（`streamifyResponse()`使用）  
✅ **タイムアウト問題解決**（15分対応）  
✅ **Continue UIで正常動作確認済み**  

## よくある問題と解決方法

### 1. Continue UIに応答が表示されない

#### 症状
- ログは記録されるのにUIに応答が表示されない
- 空のグレー領域が表示される

#### 原因
Continueは「厳密なOpenAIストリーミング（SSE）チャンク形式」を要求します。サーバ側が`stream: true`を受けたとき、Server-Sent Eventsで以下の順に返す必要があります：

1. `object: "chat.completion.chunk"`かつ`choices[0].delta.role = "assistant"`のチャンク
2. `choices[0].delta.content`に本文を入れたチャンク（複数分割でも単一でも可）
3. 最後に`data: [DONE]`を送信してストリームを閉じる

#### 解決方法

**Continue側の設定確認:**

```yaml
models:
  - name: "Backend Developer"
    provider: "openai"
    model: "backend_developer"
    apiBase: "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
    stream: true  # ← 必須
    requestOptions:
      timeout: 900000
```

**サーバ側の実装確認:**

Lambda関数（`infra/cdk/lambda/chat-completions.ts`）で以下の形式を守っているか確認：

1. 最初のチャンク（role告知）:
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

2. 本文チャンク:
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

3. ストリームの終端:
```
data: [DONE]
```

#### よくある落とし穴

- サーバが一括JSONを`data:`で一度だけ流す → UIに表示されない
- `choices[0].delta.content`ではなく`message.content`を返している（ストリーミング時） → 表示されない
- `data: [DONE]`を送らない → ストリームが閉じずUIが固まる
- `stream: true`をContinue側で付け忘れ → UIに表示されない

### 2. 503エラーが発生する

#### 症状
- 約60秒〜1分30秒で`503 status code (no body)`が返ってくる
- Lambdaログでは正常に完了している

#### 原因
- API Gatewayを使用している場合、30秒のタイムアウト制限がある
- Continue IDEの`requestOptions.timeout`が短すぎる
- Lambda Function URLの`InvokeMode`が`RESPONSE_STREAM`に設定されていない

#### 解決方法

**1. Lambda Function URLを使用する（推奨）**

Continue設定の`apiBase`をLambda Function URLに変更：

```yaml
apiBase: "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
```

**2. Continue IDEのタイムアウト設定を確認**

```yaml
requestOptions:
  timeout: 900000  # 15分 = 900秒（必須）
```

**3. Lambda Function URLのInvokeMode確認**

```powershell
$functionName = "SfAiProdStack-ChatCompletionsFunction57B9FADB-..."
aws lambda get-function-url-config --function-name $functionName --query "InvokeMode" --output text
```

`RESPONSE_STREAM`になっていることを確認。なっていない場合：

```powershell
aws lambda update-function-url-config --function-name $functionName --invoke-mode RESPONSE_STREAM
```

**4. Lambda関数のタイムアウト設定確認**

```powershell
aws lambda get-function-configuration --function-name $functionName --query "Timeout" --output text
```

900秒（15分）に設定されていることを確認。

### 3. 500エラーが発生する

#### 症状
- `500 status code (no body)`が返ってくる
- CloudWatch Logsにエラーが記録されている

#### よくある原因と解決方法

**1. `TypeError: d.finished is not a function`**

`HttpResponseStream`には`finished()`メソッドが存在しません。この呼び出しを削除してください。

**2. `Runtime.InvalidStreamingOperation: Cannot set content-type, too late.`**

メタデータ（`statusCode`と`headers`）は`HttpResponseStream.from()`を呼び出す**前**に設定する必要があります。

**3. `Cannot find module 'aws-lambda'`**

`aws-lambda`モジュールはLambdaランタイムで利用可能です。CDKの`bundling`設定で`externalModules`に含めないでください。

### 4. ストリーミングが動作しない

#### 症状
- ストリーミングリクエストで通常のJSONレスポンスが返る
- SSE形式のチャンクが返ってこない

#### 解決方法

**1. Lambda関数のコード確認**

`streamifyResponse()`を使用していることを確認：

```typescript
import { streamifyResponse } from 'aws-lambda';

export const handler = streamifyResponse(
  async (event, responseStream, context) => {
    // ストリーミング処理
  }
);
```

**2. レスポンスヘッダーの確認**

`Content-Type: text/event-stream`が設定されていることを確認。

**3. CloudWatch Logsの確認**

```powershell
aws logs tail /aws/lambda/SfAiProdStack-ChatCompletionsFunction57B9FADB-... --since 5m
```

エラーメッセージや`isFunctionUrl`の判定結果を確認。

### 5. イベント判定の問題

#### 症状
- Lambda Function URLを使用しているのに`isFunctionUrl`が`false`になる
- API GatewayとLambda Function URLの判定が正しく動作しない

#### 解決方法

Lambda Function URLのイベント判定ロジックを確認：

```typescript
const hasApiGatewayFields = 'requestContext' in event && 
  event.requestContext && 
  typeof event.requestContext === 'object' &&
  ('apiId' in event.requestContext || 'routeKey' in event.requestContext || 'stage' in event.requestContext);

// Lambda Function URL: has requestContext but NO apiId, routeKey, or stage
// API Gateway: has requestContext with apiId, routeKey, and/or stage
const isFunctionUrl = 'requestContext' in event && !hasApiGatewayFields;
```

## 過去のトラブルシューティング履歴

### 2025-12-02: タイムアウト問題の解決

**問題**: 約1分30秒で503エラーが発生

**原因**: 
- API Gatewayの30秒タイムアウト制限
- Continue IDEの`requestOptions.timeout`が60秒に設定されていた

**解決方法**:
- Lambda Function URLに移行（最大15分対応）
- Continue IDEの`requestOptions.timeout`を`900000`（15分）に設定
- Lambda Function URLの`InvokeMode`を`RESPONSE_STREAM`に設定

### 2025-12-02: 500エラーの修正

**問題**: `500 status code (no body)`が発生

**原因**:
- `HttpResponseStream.finished()`メソッドが存在しない
- メタデータの設定タイミングが遅かった

**解決方法**:
- `await httpResponseStream.finished()`の呼び出しを削除
- メタデータを`HttpResponseStream.from()`の前に設定

### 2025-10-29: SSEストリーミング実装

**問題**: Continue UIに応答が表示されない

**原因**: SSEチャンク形式が正しく実装されていなかった

**解決方法**:
- 厳密なOpenAIストリーミング形式を実装
- `role`チャンク、`content`チャンク、`[DONE]`の順序を守る

## デバッグ手順

### 1. CloudWatch Logsの確認

```powershell
aws logs tail /aws/lambda/SfAiProdStack-ChatCompletionsFunction57B9FADB-... --since 5m --follow
```

### 2. Continue IDEの開発者ツール

1. VS Code/CursorでF12キーを押して開発者ツールを開く
2. **Consoleタブ**でエラーメッセージを確認
3. **Networkタブ**でリクエスト/レスポンスを確認

### 3. 直接APIテスト

```powershell
$functionUrl = "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
$body = @{
  model = "backend_developer"
  messages = @(@{ role = "user"; content = "テストメッセージです" })
  stream = $true
} | ConvertTo-Json -Depth 10
$headers = @{'Content-Type' = 'application/json'; 'User-Agent' = 'continue-client'}
$response = Invoke-WebRequest -Uri $functionUrl -Method POST -Headers $headers -Body $body -UseBasicParsing
$response.Content
```

期待される出力:
```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: [DONE]
```

## 参考リンク

- [Continue IDE セットアップガイド](./CONTINUE_SETUP.md)
- [デプロイ手順](./DEPLOYMENT.md)
- [AWS Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [AWS Lambda Response Streaming](https://docs.aws.amazon.com/lambda/latest/dg/response-streaming.html)

