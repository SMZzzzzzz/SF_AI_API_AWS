# AWS LLM プロキシ環境セットアップガイド

## 概要

本ドキュメントは、AWS Lambda Function URLを使用したOpenAI互換APIの構築手順と運用ポイントをまとめたものです。最大15分（900秒）のタイムアウト対応とストリーミングレスポンスをサポートします。

## アーキテクチャ

| 区分 | サービス |
| ---- | -------- |
| API | **Lambda Function URL**（推奨、最大15分対応） |
| 実行 | AWS Lambda (Node.js 20) |
| 設定 | Amazon S3 (`config/model_map.json`) |
| 秘匿情報 | AWS Secrets Manager (`/sfai/prod/OPENAI_API_KEY`, `/sfai/prod/ANTHROPIC_API_KEY`) |
| 監視 | Amazon CloudWatch Logs / Metrics |
| セキュリティ | IAM 最小権限、CORS 制限（必要に応じ AWS WAF） |

**Lambda Function URLの利点:**
- 最大15分（900秒）のタイムアウト対応（API Gatewayは30秒制限）
- `streamifyResponse()`を使用した真のストリーミングレスポンス
- API Gatewayの30秒制限を回避

## ローカル環境の準備

1. **前提ツール**
   - AWS CLI v2 (PATH 設定済み)
   - Node.js 20.x & npm
   - AWS CDK CLI (`npm install -g aws-cdk@latest`)

2. **認証設定**
   ```powershell
   aws configure
   # region: ap-northeast-1
   ```

3. **IAM 権限**
   - `cloudformation:*`, `iam:*`, `s3:*`, `logs:*`, `lambda:*`, `apigateway:*`, `secretsmanager:*` 等を含む管理者レベル権限

## CDK プロジェクト

- ディレクトリ: `infra/cdk/`
- スタック名: `SfAiProdStack`

### 主なリソース

| 論理名 | 概要 |
| ------ | ---- |
| `ConfigBucket` | S3 バケット。`config/model_map.json` を格納 |
| `OpenAiApiKey`, `AnthropicApiKey` | Secrets Manager シークレット (`/sfai/prod/...`) |
| `ChatCompletionsFunction` | Lambda (Node.js 20, メモリ 512MB, タイムアウト 900 秒) |
| `ChatLambdaLogGroup` | CloudWatch Logs（保持 14 日） |
| `ChatFunctionUrl` | Lambda Function URL（推奨、15分対応、ストリーミング対応） |

### Lambda ログ構造

`chat_completion` ログに以下のフィールドを出力します：

| フィールド | 説明 |
| ---------- | ---- |
| `latestUserMessage` | 直近のユーザー発話を全文で記録（社内環境のためマスクなし） |
| `latestUserMessageLength` | 上記文字数 |
| `contextTailPreview` | 履歴全体の末尾 200 文字（Continue などが追加した文脈を参考程度に記録） |
| `tokensIn`, `tokensOut`, `costUsd` | トークン数と試算コスト |

レートリミットチェック (`RATE_LIMIT_QPM`) に引っかかった場合や LLM 呼び出し失敗時は `llm_error` ログを出力します。

## デプロイ手順

詳細は`docs/DEPLOYMENT.md`を参照してください。

### クイックスタート

```powershell
cd infra/cdk

# 初回のみ
cdk bootstrap aws://191241815598/ap-northeast-1

# スタックのデプロイ
cdk deploy SfAiProdStack --require-approval never
```

CloudFormation 出力:

```
SfAiProdStack.ChatFunctionUrl = https://<function-url-id>.lambda-url.ap-northeast-1.on.aws/
SfAiProdStack.ChatLambdaName   = SfAiProdStack-ChatCompletionsFunction57B9FADB-...
SfAiProdStack.ConfigBucketName = sfaiprodstack-configbucket2112c5ec-...
```

**重要:** `ChatFunctionUrl`を使用することを推奨します（API Gatewayは30秒制限あり）。

## 必須設定

### 1. model_map.json のアップロード

```powershell
aws s3 cp model_map.json s3://<ConfigBucketName>/config/model_map.json
```

### 2. Secrets Manager に API キーを登録

```powershell
aws secretsmanager put-secret-value `
    --secret-id /sfai/prod/OPENAI_API_KEY `
    --secret-string "<OpenAI_API_Key>"

aws secretsmanager put-secret-value `
    --secret-id /sfai/prod/ANTHROPIC_API_KEY `
    --secret-string "<Anthropic_API_Key>"
```

### 3. Lambda Function URLのInvokeMode設定（ストリーミング対応）

```powershell
$functionName = "SfAiProdStack-ChatCompletionsFunction57B9FADB-..."
aws lambda update-function-url-config --function-name $functionName --invoke-mode RESPONSE_STREAM
```

**注意:** CDKでは`invokeMode`パラメータがまだサポートされていないため、AWS CLIで手動設定が必要です。

### 4. 動作確認（Lambda Function URL推奨）

```powershell
$functionUrl = "https://<function-url-id>.lambda-url.ap-northeast-1.on.aws"
$body = @{
  model = "backend_developer"
  messages = @(@{ role = "user"; content = "Hello from AWS test." })
  stream = $true
} | ConvertTo-Json -Depth 10
$headers = @{'Content-Type' = 'application/json'; 'User-Agent' = 'continue-client'}
Invoke-WebRequest -Uri $functionUrl -Method POST -Headers $headers -Body $body -UseBasicParsing
```

期待される出力:
```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: [DONE]
```

### 5. CloudWatch Logs の確認

```powershell
aws logs tail SfAiProdStack-ChatLambdaLogGroup176FAFAE-lDLLZj4XDmH5 --since 5m
```

## Lambda Function URL の詳細

### 現在のエンドポイント

```
https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws
```

### 特徴

- ✅ **最大15分（900秒）のタイムアウト対応**
- ✅ **`streamifyResponse()`を使用した真のストリーミングレスポンス**
- ✅ **API Gatewayの30秒制限を回避**
- ✅ **CORS設定対応**
- ✅ **認証不要（FunctionUrlAuthType.NONE）**

### CDKスタックでの設定

Lambda Function URLはCDKスタックで自動的に作成されます：

```typescript
const functionUrl = chatLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  // Note: CORS設定は早期バリデーションエラーを回避するため一時的に削除
  // 後でAWS CLIで追加可能
});
```

### CORS設定（オプション）

必要に応じて、AWS CLIでCORS設定を追加できます：

```powershell
$functionName = "SfAiProdStack-ChatCompletionsFunction57B9FADB-lkptogcTLqN6"
$corsConfig = '{"AllowOrigins":["https://app.cursor.sh"],"AllowMethods":["POST","OPTIONS"],"AllowHeaders":["content-type","authorization"],"MaxAge":3600}'
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

詳細は`docs/TROUBLESHOOTING.md`を参照してください。

### ストリーミングが動作しない場合

1. **Lambda関数のコード確認**
   `streamifyResponse()`を使用していることを確認

2. **レスポンスヘッダーの確認**
   `Content-Type: text/event-stream`が設定されていることを確認

3. **CloudWatch Logsの確認**
   ```powershell
   aws logs tail /aws/lambda/SfAiProdStack-ChatCompletionsFunction57B9FADB-lkptogcTLqN6 --since 5m
   ```

## その他

- CORS 許可ドメインは CDK コンテキスト/環境変数で上書き可能 (`ALLOW_ORIGINS`)
- 追加環境を作成する場合は `environmentName` を CDK コンテキストで切り替え、Secrets / S3 バケット名を環境ごとに分離する

## 参考: 改修ハイライト

| 日付 | 内容 |
| ---- | ---- |
| 2025-11-11 | CDK プロジェクト初期化、スタック定義、Lambda 実装、API Gateway 設定 |
| 2025-11-11 | CloudWatch ログに `latestUserMessage` 等のフィールドを追加 |
| 2025-11-11 | プロダクション環境にデプロイし、Python 経由で動作確認済み |
| 2025-12-02 | Lambda Function URL追加、`streamifyResponse()`実装、タイムアウト15分対応、ストリーミングレスポンス対応完了 |

## 参考リンク

- [AWS Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [AWS Lambda Response Streaming](https://docs.aws.amazon.com/lambda/latest/dg/response-streaming.html)
- [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)
- [デプロイ手順](./DEPLOYMENT.md)
- [Continue IDE セットアップガイド](./CONTINUE_SETUP.md)
- [トラブルシューティングガイド](./TROUBLESHOOTING.md)











