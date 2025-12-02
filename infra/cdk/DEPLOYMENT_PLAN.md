# AWS CDK デプロイ計画書

## 📋 現状確認

### 完了済み
- ✅ Lambda関数のリファクタリング完了（`processRequest`関数による共通化）
- ✅ ストリーミング/非ストリーミングの両方で同じロジックを使用
- ✅ 型エラーの修正完了
- ✅ CDKスタック定義完了（`lib/cdk-stack.ts`）

### 未完了
- ⏳ AWS CDKでのデプロイ未実施
- ⏳ Lambda Function URLのストリーミング設定（`RESPONSE_STREAM`）未設定
- ⏳ デプロイ後の動作確認未実施
- ⏳ 環境変数・シークレットの設定確認未実施

---

## 🎯 デプロイ目標

1. AWS CDKスタックをデプロイして、Lambda + API Gateway + S3 + Secrets Managerを構築
2. Lambda Function URLをストリーミング対応にする
3. デプロイ後の動作確認を実施
4. 本番環境として利用開始

---

## 📝 事前準備チェックリスト

### 1. AWS環境の準備
- [ ] AWSアカウントにログイン
- [ ] AWS CLIの設定完了（`aws configure`）
- [ ] CDK CLIのインストール確認（`npm install -g aws-cdk`）
- [ ] CDKブートストラップ完了（`cdk bootstrap`）

### 2. シークレットの準備
- [ ] OpenAI APIキーを取得
- [ ] Anthropic APIキーを取得
- [ ] Secrets Managerにシークレットを作成：
  ```bash
  # OpenAI APIキー
  aws secretsmanager create-secret \
    --name /sfai/prod/OPENAI_API_KEY \
    --secret-string "sk-..." \
    --region ap-northeast-1

  # Anthropic APIキー
  aws secretsmanager create-secret \
    --name /sfai/prod/ANTHROPIC_API_KEY \
    --secret-string "sk-ant-..." \
    --region ap-northeast-1
  ```

### 3. S3バケットとmodel_map.jsonの準備
- [ ] `model_map.json`ファイルの準備（プロジェクトルートにある）
- [ ] S3バケットにアップロード（デプロイ後にバケット名が確定してから）

### 4. 環境変数の設定
- [ ] `.env`ファイルまたは環境変数の設定：
  ```bash
  export CDK_DEFAULT_ACCOUNT=<AWS_ACCOUNT_ID>
  export CDK_DEFAULT_REGION=ap-northeast-1
  export SFAI_ENV=prod
  export SFAI_CONFIG_BUCKET=sfai-prod-config-<UNIQUE_SUFFIX>
  ```

---

## 🚀 デプロイ手順

### ステップ1: 依存関係のインストール

```powershell
cd infra/cdk
npm install
```

### ステップ2: TypeScriptのビルド

```powershell
npm run build
```

### ステップ3: CDKの合成（CloudFormationテンプレート生成）

```powershell
npx cdk synth
```

このコマンドで生成されるCloudFormationテンプレートを確認し、問題がないかチェックします。

### ステップ4: CDKの差分確認

```powershell
npx cdk diff
```

既存のスタックがない場合は、新規作成されるリソース一覧が表示されます。

### ステップ5: デプロイ実行

```powershell
npx cdk deploy
```

デプロイ中に確認が求められる場合があります：
- `Do you wish to deploy these changes (y/n)?` → `y`を入力

### ステップ6: デプロイ結果の確認

デプロイが完了すると、以下のような出力が表示されます：

```
Outputs:
SfAiProdStack.ConfigBucketName = sfai-prod-config-xxxxx
SfAiProdStack.AuditLogBucketName = sfai-prod-audit-xxxxx
SfAiProdStack.ChatApiEndpoint = https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
SfAiProdStack.ChatLambdaName = SfAiProdStack-ChatCompletionsFunction-xxxxx
SfAiProdStack.ChatFunctionUrl = https://xxxxx.lambda-url.ap-northeast-1.on.aws/
```

**重要**: これらの出力値を控えておいてください。

---

## 🔧 デプロイ後の設定

### 1. model_map.jsonをS3にアップロード

```powershell
# デプロイ出力からバケット名を取得
$BUCKET_NAME = "sfai-prod-config-xxxxx"  # 実際のバケット名に置き換え

# model_map.jsonをアップロード
aws s3 cp ..\..\model_map.json s3://$BUCKET_NAME/config/model_map.json --region ap-northeast-1
```

### 2. Lambda Function URLをストリーミング対応にする

CDKでは`invokeMode`パラメータがまだサポートされていないため、AWS CLIで手動設定が必要です：

```powershell
# デプロイ出力からLambda関数名を取得
$LAMBDA_NAME = "SfAiProdStack-ChatCompletionsFunction-xxxxx"  # 実際の関数名に置き換え

# ストリーミングモードに更新
aws lambda update-function-url-config `
  --function-name $LAMBDA_NAME `
  --invoke-mode RESPONSE_STREAM `
  --region ap-northeast-1
```

### 3. APIキーのシークレット値設定

シークレットが既に存在する場合は、値を更新：

```powershell
# OpenAI APIキーを更新
aws secretsmanager put-secret-value `
  --secret-id /sfai/prod/OPENAI_API_KEY `
  --secret-string "sk-..." `
  --region ap-northeast-1

# Anthropic APIキーを更新
aws secretsmanager put-secret-value `
  --secret-id /sfai/prod/ANTHROPIC_API_KEY `
  --secret-string "sk-ant-..." `
  --region ap-northeast-1
```

---

## ✅ 動作確認

### 1. API Gatewayエンドポイントのテスト

```powershell
$API_ENDPOINT = "https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/chat/completions"

$body = @{
    model = "backend_developer"
    messages = @(
        @{
            role = "user"
            content = "Hello, test message"
        }
    )
    stream = $false
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri $API_ENDPOINT -Method POST -Body $body -Headers $headers
```

### 2. Lambda Function URLのテスト（ストリーミング）

```powershell
$FUNCTION_URL = "https://xxxxx.lambda-url.ap-northeast-1.on.aws/"

$body = @{
    model = "backend_developer"
    messages = @(
        @{
            role = "user"
            content = "Hello, streaming test"
        }
    )
    stream = $true
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
}

$response = Invoke-WebRequest -Uri $FUNCTION_URL -Method POST -Body $body -Headers $headers
$response.Content
```

期待される出力（SSE形式）：
```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: [DONE]
```

### 3. ログの確認

```powershell
# CloudWatch Logsを確認
aws logs tail /aws/lambda/SfAiProdStack-ChatCompletionsFunction-xxxxx --follow --region ap-northeast-1
```

---

## 🔍 トラブルシューティング

### 問題1: CDKデプロイ時にエラーが発生する

**症状**: `Need to perform AWS calls for account XXXXXXXXXXX` のようなエラー

**解決策**:
```powershell
npx cdk bootstrap aws://ACCOUNT_ID/ap-northeast-1
```

### 問題2: Secrets Managerでシークレットが見つからない

**症状**: `ResourceNotFoundException` が発生

**解決策**: 事前準備チェックリストの「シークレットの準備」を実施

### 問題3: S3バケットへのアクセスが拒否される

**症状**: `Access Denied` エラー

**解決策**: Lambda関数のIAMロールにS3読み取り権限があるか確認（CDKスタックで自動設定されているはず）

### 問題4: ストリーミングが動作しない

**症状**: ストリーミングリクエストで通常のJSONレスポンスが返る

**解決策**: Lambda Function URLの`invokeMode`が`RESPONSE_STREAM`に設定されているか確認

---

## 📊 デプロイ後のリソース一覧

デプロイが完了すると、以下のリソースが作成されます：

1. **S3バケット（設定用）**
   - 名前: `sfai-prod-config-xxxxx`
   - 用途: `model_map.json`の保存

2. **S3バケット（監査ログ用）**
   - 名前: `sfai-prod-audit-xxxxx`
   - 用途: リクエスト/レスポンスの監査ログ保存

3. **Secrets Manager**
   - `/sfai/prod/OPENAI_API_KEY`
   - `/sfai/prod/ANTHROPIC_API_KEY`

4. **Lambda関数**
   - 名前: `SfAiProdStack-ChatCompletionsFunction-xxxxx`
   - ランタイム: Node.js 20.x
   - メモリ: 512 MB
   - タイムアウト: 900秒（15分）

5. **API Gateway HTTP API**
   - エンドポイント: `https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod`
   - タイムアウト制限: 30秒（API Gatewayの制限）

6. **Lambda Function URL**
   - エンドポイント: `https://xxxxx.lambda-url.ap-northeast-1.on.aws/`
   - タイムアウト: 15分（ストリーミング推奨）

7. **CloudWatch Logs**
   - ロググループ: `/aws/lambda/SfAiProdStack-ChatCompletionsFunction-xxxxx`
   - 保持期間: 14日

---

## 🎯 次のステップ

デプロイ完了後：

1. **Continue設定の更新**
   - `apiBase`を新しいLambda Function URLに変更
   - `docs/continue-config-reference.yaml`を参照

2. **監視の設定**
   - CloudWatchアラームの設定（エラー率、レイテンシなど）
   - コストアラートの設定

3. **セキュリティの強化**
   - APIキー認証の追加検討
   - IP制限の検討
   - WAFの検討

4. **パフォーマンスの最適化**
   - コールドスタート対策（プロビジョニング済み同時実行）
   - キャッシュ戦略の検討

---

## 📝 チェックリストまとめ

デプロイ前：
- [ ] AWS環境の準備完了
- [ ] シークレットの作成完了
- [ ] 環境変数の設定完了
- [ ] CDKブートストラップ完了

デプロイ中：
- [ ] `npm install`完了
- [ ] `npm run build`完了
- [ ] `npx cdk synth`でエラーなし
- [ ] `npx cdk diff`で確認
- [ ] `npx cdk deploy`完了

デプロイ後：
- [ ] `model_map.json`をS3にアップロード
- [ ] Lambda Function URLをストリーミング対応に設定
- [ ] API Gatewayエンドポイントのテスト成功
- [ ] Lambda Function URL（ストリーミング）のテスト成功
- [ ] CloudWatch Logsで正常動作確認

---

## 📚 参考リンク

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Lambda Function URL Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [API Gateway HTTP API Documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)

