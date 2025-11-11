# インフラ（AWS・単一環境・低コスト）デプロイ手順

このディレクトリは、API Gateway + Lambda + S3 + Secrets Manager + CloudWatch で Supabase相当のOpenAI互換API(`/chat/completions`)を提供する最小構成（prod単一環境）です。

## 前提
- リージョン: ap-northeast-1（変更可）
- 環境名: prod
- Node.js 20 / SAM CLI インストール済み

## ディレクトリ
- `sam/template.yaml`: SAMテンプレート
- `sam/src/index.ts`: Lambdaハンドラー実装

## 事前準備
1) Secrets Manager（キー/値）
- OPENAI: `OpenAISecretArn`（例: `/sfai/prod/OPENAI_API_KEY`）
- ANTHROPIC: `AnthropicSecretArn`（例: `/sfai/prod/ANTHROPIC_API_KEY`）

2) model_map.json
- S3に `config/model_map.json` をアップロード（バケット名は `ConfigBucketName`）
- 例:
```json
{
  "_default": { "provider": "openai", "model": "gpt-4o-mini" },
  "backend":   { "provider": "anthropic", "model": "claude-3-5-sonnet-20240620" }
}
```

## ビルド & デプロイ
```bash
cd infra/sam
npm ci
npm run build
# SAMビルド（esbuildで dist/index.mjs を含める）
SAM_BUILD_MODE=build sam build --use-container
sam deploy \
  --stack-name sfai-prod-llm-proxy \
  --region ap-northeast-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    EnvironmentName=prod \
    AwsRegion=ap-northeast-1 \
    ConfigBucketName=sfai-prod-config \
    ModelMapKey=config/model_map.json \
    AllowOrigins=https://app.cursor.sh \
    RateLimitQPM=60 \
    LogMaskPII=true \
    OpenAISecretArn=arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:/sfai/prod/OPENAI_API_KEY-xxxx \
    AnthropicSecretArn=arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:/sfai/prod/ANTHROPIC_API_KEY-xxxx
```

デプロイ後、出力 `ApiEndpoint` を控えてください。

## 動作確認
```bash
curl -X POST "https://<host>/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "backend",
    "messages": [{"role":"user","content":"Hello!"}]
  }'
```

## 運用
- CORSは `AllowOrigins` で制御（本番は限定ドメインのみ）
- CloudWatch Logs の保持期間はアカウント側ポリシーで短めに設定
- コストはAPI GW/Lambda/Secrets/S3/Logsのみ（DB不使用）
