# デプロイ手順

## 概要

本プロジェクトはAWS CDKを使用してLambda Function URLベースのOpenAI互換APIを構築します。最大15分（900秒）のタイムアウト対応とストリーミングレスポンスをサポートします。

## 前提条件

- AWS CLI v2 (PATH設定済み)
- Node.js 20.x & npm
- AWS CDK CLI (`npm install -g aws-cdk@latest`)
- AWS認証設定済み（`aws configure`）

## アーキテクチャ

| 区分 | サービス |
| ---- | -------- |
| API | Lambda Function URL（推奨、最大15分対応） |
| 実行 | AWS Lambda (Node.js 20) |
| 設定 | Amazon S3 (`config/model_map.json`) |
| 秘匿情報 | AWS Secrets Manager (`/sfai/prod/OPENAI_API_KEY`, `/sfai/prod/ANTHROPIC_API_KEY`) |
| 監視 | Amazon CloudWatch Logs / Metrics |
| セキュリティ | IAM 最小権限、CORS 制限 |

## デプロイ手順

### 1. CDKプロジェクトのセットアップ

```powershell
cd infra/cdk

# 初回のみ（CDKブートストラップ）
cdk bootstrap aws://191241815598/ap-northeast-1

# 依存関係のインストール
npm install
```

### 2. CDKスタックのデプロイ

```powershell
# スタックのデプロイ
cdk deploy SfAiProdStack --require-approval never
```

デプロイ完了後、以下の出力が表示されます：

```
SfAiProdStack.ChatFunctionUrl = https://<function-url-id>.lambda-url.ap-northeast-1.on.aws/
SfAiProdStack.ChatLambdaName   = SfAiProdStack-ChatCompletionsFunction57B9FADB-...
SfAiProdStack.ConfigBucketName = sfaiprodstack-configbucket2112c5ec-...
```

**重要:** `ChatFunctionUrl`を使用することを推奨します（API Gatewayは30秒制限あり）。

### 3. 必須設定

#### 3.1 model_map.jsonのアップロード

```powershell
$bucketName = "sfaiprodstack-configbucket2112c5ec-..."  # デプロイ出力から取得
aws s3 cp model_map.json s3://$bucketName/config/model_map.json
```

#### 3.2 Secrets ManagerにAPIキーを登録

```powershell
aws secretsmanager put-secret-value `
    --secret-id /sfai/prod/OPENAI_API_KEY `
    --secret-string "<OpenAI_API_Key>"

aws secretsmanager put-secret-value `
    --secret-id /sfai/prod/ANTHROPIC_API_KEY `
    --secret-string "<Anthropic_API_Key>"
```

#### 3.3 Lambda Function URLのInvokeMode設定（ストリーミング対応）

```powershell
$functionName = "SfAiProdStack-ChatCompletionsFunction57B9FADB-..."  # デプロイ出力から取得
aws lambda update-function-url-config --function-name $functionName --invoke-mode RESPONSE_STREAM
```

### 4. 動作確認

#### 4.1 Lambda Function URLでテスト

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

#### 4.2 CloudWatch Logsの確認

```powershell
aws logs tail SfAiProdStack-ChatLambdaLogGroup176FAFAE-lDLLZj4XDmH5 --since 5m
```

## Continue IDEの設定

`docs/continue-config-reference.yaml`を参照し、`apiBase`をLambda Function URLに設定：

```yaml
models:
  - name: "Backend Developer"
    provider: "openai"
    model: "backend_developer"
    apiBase: "https://<function-url-id>.lambda-url.ap-northeast-1.on.aws"
    apiKey: "sk-dummy-key-not-required"
    stream: true
    requestOptions:
      timeout: 900000  # 15分 = 900秒
```

詳細は`docs/CONTINUE_SETUP.md`を参照してください。

## 更新手順

### コード変更時の再デプロイ

```powershell
cd infra/cdk
cdk deploy SfAiProdStack --require-approval never
```

### モデルマッピングの変更

1. `model_map.json`を編集
2. S3に再アップロード

```powershell
aws s3 cp model_map.json s3://$bucketName/config/model_map.json
```

**再デプロイ不要！** 次回リクエストから新しい設定が適用されます。

### 環境変数の変更

Secrets Managerの値を更新：

```powershell
aws secretsmanager put-secret-value `
    --secret-id /sfai/prod/OPENAI_API_KEY `
    --secret-string "<New_OpenAI_API_Key>"
```

## トラブルシューティング

### デプロイエラー

```powershell
# 詳細ログを確認
cdk deploy SfAiProdStack --require-approval never --verbose
```

### 実行時エラー

```powershell
# CloudWatch Logsを確認
aws logs tail /aws/lambda/SfAiProdStack-ChatCompletionsFunction57B9FADB-... --since 5m
```

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

## セキュリティチェックリスト

- ✅ APIキーはSecrets Managerで管理（コードに直接記載しない）
- ✅ CORS設定を適切に制限（本番環境では `*` を避ける）
- ✅ IAM最小権限の原則
- ✅ 定期的なログ監視

## 参考リンク

- [AWS Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [AWS Lambda Response Streaming](https://docs.aws.amazon.com/lambda/latest/dg/response-streaming.html)
- [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)
- [Continue IDE セットアップガイド](./CONTINUE_SETUP.md)




