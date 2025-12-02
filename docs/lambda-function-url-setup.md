# Lambda Function URL セットアップガイド

## 概要

Lambda Function URLを使用することで、API Gatewayの30秒タイムアウト制限を回避し、最大15分（900秒）までの長時間処理に対応できます。また、`streamifyResponse()`を使用した真のストリーミングレスポンスが可能です。

## 現在のエンドポイント

```
https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws
```

## 特徴

- ✅ **最大15分（900秒）のタイムアウト対応**
- ✅ **`streamifyResponse()`を使用した真のストリーミングレスポンス**
- ✅ **API Gatewayの30秒制限を回避**
- ✅ **CORS設定対応**
- ✅ **認証不要（FunctionUrlAuthType.NONE）**

## CDKスタックでの設定

Lambda Function URLはCDKスタックで自動的に作成されます：

```typescript
const functionUrl = chatLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  // Note: CORS設定は早期バリデーションエラーを回避するため一時的に削除
  // 後でAWS CLIで追加可能
});
```

## InvokeMode設定

ストリーミングレスポンスを使用するには、`InvokeMode`を`RESPONSE_STREAM`に設定する必要があります：

```powershell
$functionName = "SfAiProdStack-ChatCompletionsFunction57B9FADB-lkptogcTLqN6"
aws lambda update-function-url-config --function-name $functionName --invoke-mode RESPONSE_STREAM
```

## Continue IDEでの設定

`docs/continue-config-reference.yaml`を参照し、`apiBase`をLambda Function URLに設定：

```yaml
models:
  - name: "Backend Developer"
    provider: "openai"
    model: "backend_developer"
    apiBase: "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
    apiKey: "sk-dummy-key-not-required"
    stream: true
    requestOptions:
      timeout: 900000  # 15分 = 900秒
      headers:
        "User-Agent": "continue-client"
        "Content-Type": "application/json"
```

## テストリクエスト

### PowerShell

```powershell
$functionUrl = "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
$body = @{
  model = "backend_developer"
  messages = @(@{ role = "user"; content = "こんにちは。テストメッセージです。" })
  stream = $true
  temperature = 0.7
  max_tokens = 100
} | ConvertTo-Json -Depth 10

$headers = @{
  "Content-Type" = "application/json"
  "User-Agent" = "continue-client"
}

$response = Invoke-WebRequest -Uri $functionUrl -Method POST -Headers $headers -Body $body -TimeoutSec 120 -UseBasicParsing
$response.Content
```

### 期待される出力

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"content":"..."},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

## CORS設定（オプション）

必要に応じて、AWS CLIでCORS設定を追加できます：

```powershell
$functionName = "SfAiProdStack-ChatCompletionsFunction57B9FADB-lkptogcTLqN6"
$corsConfig = '{\"AllowOrigins\":[\"https://app.cursor.sh\"],\"AllowMethods\":[\"POST\",\"OPTIONS\"],\"AllowHeaders\":[\"content-type\",\"authorization\"],\"MaxAge\":3600}'
aws lambda update-function-url-config --function-name $functionName --cors $corsConfig
```

## トラブルシューティング

### 503エラーが発生する場合

1. **InvokeModeの確認**
   ```powershell
   aws lambda get-function-url-config --function-name $functionName --query "InvokeMode" --output text
   ```
   `RESPONSE_STREAM`になっていることを確認

2. **Lambda関数のタイムアウト設定**
   ```powershell
   aws lambda get-function-configuration --function-name $functionName --query "Timeout" --output text
   ```
   900秒（15分）に設定されていることを確認

3. **Continue IDEのタイムアウト設定**
   `requestOptions.timeout`が`900000`（15分）に設定されていることを確認

### ストリーミングが動作しない場合

1. **Lambda関数のコード確認**
   `streamifyResponse()`を使用していることを確認

2. **レスポンスヘッダーの確認**
   `Content-Type: text/event-stream`が設定されていることを確認

3. **CloudWatch Logsの確認**
   ```powershell
   aws logs tail /aws/lambda/SfAiProdStack-ChatCompletionsFunction57B9FADB-lkptogcTLqN6 --since 5m
   ```

## 参考

- [AWS Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [AWS Lambda Response Streaming](https://docs.aws.amazon.com/lambda/latest/dg/response-streaming.html)
- [Continue IDE セットアップガイド](./CONTINUE_SETUP.md)

