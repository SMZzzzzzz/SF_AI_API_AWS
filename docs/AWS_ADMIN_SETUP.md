# AWS環境構築手順書（管理者向け）

## 概要

本ドキュメントは、社内のAWS管理者がAWS Lambda Function URLベースのOpenAI互換LLMプロキシAPIの環境を構築するための手順書です。

このシステムは、Continue IDEなどのクライアントから複数のLLMプロバイダー（OpenAI、Anthropic）を統一的に利用できるAPIを提供します。

## 構築するアーキテクチャ

```
Continue IDE / その他クライアント
    ↓ (HTTPS POST)
AWS Lambda Function URL
    ↓ (ルーティング)
OpenAI API / Anthropic API
    ↓ (レスポンス)
クライアント (SSEストリーミング)
```

### 使用するAWSサービス

| サービス | 用途 | 備考 |
|---------|------|------|
| **Lambda Function URL** | APIエンドポイント | 最大15分（900秒）のタイムアウト対応 |
| **AWS Lambda** | 実行環境 | Node.js 20.x、メモリ512MB、タイムアウト900秒 |
| **Amazon S3** | 設定ファイル保存 | `model_map.json`を格納 |
| **AWS Secrets Manager** | APIキー管理 | OpenAI/Anthropic APIキーを安全に保存 |
| **CloudWatch Logs** | ログ管理 | リクエスト/レスポンスログ（保持3年） |
| **IAM** | 権限管理 | Lambda実行ロール、最小権限の原則 |

## 前提条件

### 1. AWSアカウント情報

以下の情報を事前に確認してください：

- **AWSアカウントID**: `_______________` （記入してください）
- **リージョン**: `ap-northeast-1` （東京リージョン、変更可能）
- **環境名**: `prod` （本番環境）

### 2. 必要な権限

デプロイを実行するIAMユーザー/ロールには、以下の権限が必要です：

- `cloudformation:*`
- `iam:CreateRole`, `iam:DeleteRole`, `iam:AttachRolePolicy`, `iam:DetachRolePolicy`, `iam:PutRolePolicy`, `iam:DeleteRolePolicy`, `iam:GetRole`, `iam:PassRole`
- `s3:CreateBucket`, `s3:DeleteBucket`, `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket`
- `lambda:*`
- `logs:CreateLogGroup`, `logs:DeleteLogGroup`, `logs:PutRetentionPolicy`
- `secretsmanager:CreateSecret`, `secretsmanager:DeleteSecret`, `secretsmanager:PutSecretValue`, `secretsmanager:GetSecretValue`
- `apigateway:*` （API Gatewayを使用する場合）

### 3. 必要なツール

ローカル環境（デプロイを実行するマシン）に以下をインストールしてください：

- **AWS CLI v2**: [インストールガイド](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **Node.js 20.x**: [ダウンロード](https://nodejs.org/)
- **npm**: Node.jsと一緒にインストールされます
- **AWS CDK CLI**: `npm install -g aws-cdk@latest`でインストール

### 4. 必要なAPIキー

以下のAPIキーを事前に取得してください：

- **OpenAI APIキー**: `sk-...` （[OpenAI Platform](https://platform.openai.com/api-keys)で取得）
- **Anthropic APIキー**: `sk-ant-...` （[Anthropic Console](https://console.anthropic.com/)で取得）

## セットアップ手順

### ステップ1: AWS CLIの設定確認

```powershell
# AWS CLIの認証情報を確認
aws configure list

# リージョンが ap-northeast-1 に設定されていることを確認
aws configure get region
```

**確認事項:**
- [ ] AWS CLIが正しくインストールされている
- [ ] 認証情報（Access Key ID、Secret Access Key）が設定されている
- [ ] リージョンが `ap-northeast-1` に設定されている

### ステップ2: プロジェクトの準備

開発チームから以下のファイルを受け取っていることを確認してください：

- `infra/cdk/` ディレクトリ（CDKプロジェクト）
- `model_map.json` ファイル（モデルマッピング設定）

```powershell
# プロジェクトディレクトリに移動
cd <プロジェクトルート>/infra/cdk

# 依存関係のインストール
npm install
```

**確認事項:**
- [ ] `package.json` が存在する
- [ ] `npm install` が正常に完了した
- [ ] `node_modules/` ディレクトリが作成された

### ステップ3: CDKブートストラップ（初回のみ）

**重要:** この手順はAWSアカウントごとに1回のみ実行してください。

```powershell
# AWSアカウントIDを確認（必要に応じて置き換え）
$accountId = "191241815598"  # 実際のAWSアカウントIDに置き換え
$region = "ap-northeast-1"

# CDKブートストラップを実行
cdk bootstrap aws://$accountId/$region
```

**確認事項:**
- [ ] `CDKToolkit` という名前のCloudFormationスタックが作成された
- [ ] ブートストラップが正常に完了した（エラーメッセージがない）

### ステップ4: CDKスタックのデプロイ

```powershell
# スタックをデプロイ
cdk deploy SfAiProdStack --require-approval never
```

デプロイには約5-10分かかります。

デプロイ完了後、以下の出力が表示されます：

```
✅  SfAiProdStack

Outputs:
SfAiProdStack.ChatFunctionUrl = https://<function-url-id>.lambda-url.ap-northeast-1.on.aws/
SfAiProdStack.ChatLambdaName = SfAiProdStack-ChatCompletionsFunction57B9FADB-...
SfAiProdStack.ConfigBucketName = sfaiprodstack-configbucket2112c5ec-...
```

**重要:** これらの出力値をメモしてください。後続の手順で使用します。

**確認事項:**
- [ ] デプロイが正常に完了した
- [ ] 出力値（`ChatFunctionUrl`、`ChatLambdaName`、`ConfigBucketName`）を記録した

### ステップ5: 設定ファイル（model_map.json）のアップロード

```powershell
# バケット名を変数に設定（デプロイ出力から取得）
$bucketName = "sfaiprodstack-configbucket2112c5ec-..."  # 実際のバケット名に置き換え

# model_map.jsonをアップロード
aws s3 cp model_map.json s3://$bucketName/config/model_map.json

# アップロードを確認
aws s3 ls s3://$bucketName/config/
```

**確認事項:**
- [ ] `model_map.json` が正常にアップロードされた
- [ ] S3バケット内に `config/model_map.json` が存在する

### ステップ6: Secrets ManagerにAPIキーを登録

```powershell
# OpenAI APIキーを登録
aws secretsmanager put-secret-value `
    --secret-id /sfai/prod/OPENAI_API_KEY `
    --secret-string "<OpenAI_API_Key>" `
    --region ap-northeast-1

# Anthropic APIキーを登録
aws secretsmanager put-secret-value `
    --secret-id /sfai/prod/ANTHROPIC_API_KEY `
    --secret-string "<Anthropic_API_Key>" `
    --region ap-northeast-1

# 登録を確認（値は表示されませんが、エラーがなければOK）
aws secretsmanager describe-secret --secret-id /sfai/prod/OPENAI_API_KEY --region ap-northeast-1
aws secretsmanager describe-secret --secret-id /sfai/prod/ANTHROPIC_API_KEY --region ap-northeast-1
```

**セキュリティ注意事項:**
- APIキーは必ずSecrets Managerで管理してください（コードや環境変数に直接記載しない）
- シークレット名は `/sfai/prod/OPENAI_API_KEY` と `/sfai/prod/ANTHROPIC_API_KEY` を使用してください

**確認事項:**
- [ ] 両方のAPIキーが正常に登録された
- [ ] シークレットが存在することを確認した

### ステップ7: Lambda Function URLのストリーミング設定

Lambda Function URLでストリーミングレスポンスを有効化するため、InvokeModeを設定します。

```powershell
# Lambda関数名を変数に設定（デプロイ出力から取得）
$functionName = "SfAiProdStack-ChatCompletionsFunction57B9FADB-..."  # 実際の関数名に置き換え

# InvokeModeをRESPONSE_STREAMに設定
aws lambda update-function-url-config `
    --function-name $functionName `
    --invoke-mode RESPONSE_STREAM `
    --region ap-northeast-1

# 設定を確認
aws lambda get-function-url-config `
    --function-name $functionName `
    --region ap-northeast-1 `
    --query "InvokeMode" `
    --output text
```

出力が `RESPONSE_STREAM` と表示されればOKです。

**確認事項:**
- [ ] InvokeModeが `RESPONSE_STREAM` に設定された
- [ ] 設定確認コマンドで正しい値が表示された

### ステップ8: 動作確認テスト

```powershell
# Lambda Function URLを変数に設定（デプロイ出力から取得）
$functionUrl = "https://<function-url-id>.lambda-url.ap-northeast-1.on.aws"  # 実際のURLに置き換え

# テストリクエストを送信
$body = @{
  model = "backend_developer"
  messages = @(
    @{
      role = "user"
      content = "こんにちは。動作確認テストです。"
    }
  )
  stream = $true
} | ConvertTo-Json -Depth 10

$headers = @{
  'Content-Type' = 'application/json'
  'User-Agent' = 'continue-client'
}

# リクエストを送信
$response = Invoke-WebRequest `
    -Uri "$functionUrl/chat/completions" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -UseBasicParsing

# レスポンスを表示
$response.Content
```

**期待される出力:**
```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"content":"こんにちは"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"...","choices":[{"index":0,"delta":{"content":"。"},"finish_reason":null}]}

...

data: [DONE]
```

**確認事項:**
- [ ] リクエストが正常に送信された（HTTPステータスコード200）
- [ ] SSE形式のレスポンスが返ってきた
- [ ] 最後に `data: [DONE]` が表示された

### ステップ9: CloudWatch Logsの保持期間を3年に設定

CloudWatch Logsのログ保持期間を3年（1095日）に設定します。

#### 方法1: 既存ロググループの保持期間を変更（推奨）

```powershell
# ロググループ名を確認
$logGroupName = "/aws/lambda/SfAiProdStack-ChatCompletionsFunction57B9FADB-..."  # 実際のロググループ名に置き換え

# 保持期間を3年（1095日）に設定
aws logs put-retention-policy `
    --log-group-name $logGroupName `
    --retention-in-days 1095 `
    --region ap-northeast-1

# 設定を確認
aws logs describe-log-groups `
    --log-group-name-prefix "/aws/lambda/SfAiProdStack-ChatCompletionsFunction" `
    --region ap-northeast-1 `
    --query "logGroups[0].retentionInDays" `
    --output text
```

出力が `1095` と表示されればOKです。

#### 方法2: CDKスタックで保持期間を設定（新規デプロイ時）

新規デプロイ時や再デプロイ時に、CDKスタックで保持期間を設定する場合は、開発チームに依頼して以下の変更を行ってもらいます：

**ファイル**: `infra/cdk/lib/cdk-stack.ts`

```typescript
// 変更前（39行目付近）
const logRetention = props?.logRetentionDays ?? RetentionDays.TWO_WEEKS;

// 変更後
const logRetention = props?.logRetentionDays ?? RetentionDays.THREE_YEARS;
```

変更後、再デプロイを実行してください。

**確認事項:**
- [ ] ログ保持期間が1095日（3年）に設定された
- [ ] 設定確認コマンドで正しい値が表示された

### ステップ10: CloudWatch Logsの確認

```powershell
# ロググループ名を確認（デプロイ時の出力を確認、または以下で一覧表示）
aws logs describe-log-groups `
    --region ap-northeast-1 `
    --query "logGroups[?contains(logGroupName, 'SfAiProdStack-ChatLambdaLogGroup')].logGroupName" `
    --output text

# ログを確認（過去5分間）
aws logs tail <ロググループ名> `
    --since 5m `
    --region ap-northeast-1
```

**確認事項:**
- [ ] ロググループが作成されている
- [ ] テストリクエストのログが記録されている
- [ ] エラーログがない

### ステップ11: アクセス制御の確認

Lambda Function URLへのアクセスは、既存のAWSネットワーク設定（インバウンド設定）により、社内IPアドレスのみ許可されています。

**確認事項:**
- [ ] ネットワーク設定で社内IPのみアクセス可能になっていることを確認
- [ ] 社内IPからのアクセスが正常に動作することを確認
- [ ] 社外IPからのアクセスがブロックされることを確認

**注意:** ネットワーク設定の詳細については、AWS管理者に確認してください。

## 構築後の確認チェックリスト

以下の項目をすべて確認してください：

### インフラストラクチャ

- [ ] Lambda関数が作成され、タイムアウトが900秒（15分）に設定されている
- [ ] Lambda Function URLが作成され、`InvokeMode`が`RESPONSE_STREAM`に設定されている
- [ ] S3バケットが作成され、`model_map.json`がアップロードされている
- [ ] Secrets ManagerにAPIキーが登録されている
- [ ] CloudWatch Logsグループが作成され、保持期間が3年（1095日）に設定されている
- [ ] ネットワーク設定で社内IPのみアクセス可能になっている

### セキュリティ

- [ ] APIキーがSecrets Managerで管理されている（コードに直接記載されていない）
- [ ] S3バケットがパブリックアクセスをブロックしている
- [ ] Lambda関数に適切なIAMロールが割り当てられている（最小権限の原則）

### 動作確認

- [ ] テストリクエストが正常に処理された
- [ ] SSEストリーミングレスポンスが返ってきた
- [ ] CloudWatch Logsにログが記録されている

## 情報の引き継ぎ

構築が完了したら、開発チームに以下の情報を提供してください：

1. **Lambda Function URL**: `https://<function-url-id>.lambda-url.ap-northeast-1.on.aws`
2. **Lambda関数名**: `SfAiProdStack-ChatCompletionsFunction57B9FADB-...`
3. **S3バケット名**: `sfaiprodstack-configbucket2112c5ec-...`


## トラブルシューティング

### デプロイが失敗する場合

```powershell
# 詳細なログを確認
cdk deploy SfAiProdStack --require-approval never --verbose

# CloudFormationスタックの状態を確認
aws cloudformation describe-stacks `
    --stack-name SfAiProdStack `
    --region ap-northeast-1 `
    --query "Stacks[0].StackStatus" `
    --output text

# スタックイベントを確認
aws cloudformation describe-stack-events `
    --stack-name SfAiProdStack `
    --region ap-northeast-1 `
    --max-items 20
```

### Lambda関数がタイムアウトする場合

```powershell
# タイムアウト設定を確認
aws lambda get-function-configuration `
    --function-name $functionName `
    --region ap-northeast-1 `
    --query "Timeout" `
    --output text

# 900秒（15分）に設定されていることを確認
```

### ストリーミングが動作しない場合

```powershell
# InvokeModeを確認
aws lambda get-function-url-config `
    --function-name $functionName `
    --region ap-northeast-1 `
    --query "InvokeMode" `
    --output text

# RESPONSE_STREAM と表示されることを確認
```

### Secrets Managerのアクセスエラー

```powershell
# シークレットが存在するか確認
aws secretsmanager describe-secret `
    --secret-id /sfai/prod/OPENAI_API_KEY `
    --region ap-northeast-1

# Lambda関数のIAMロールにSecrets Managerへのアクセス権限があるか確認
aws iam get-role-policy `
    --role-name <Lambda実行ロール名> `
    --policy-name <ポリシー名>
```

## コスト見積もり

### 月間コストの目安

| サービス | 使用量目安 | 月間コスト目安 |
|---------|----------|--------------|
| **Lambda** | 100万リクエスト、GB秒: 約50,000 | 約$1.00 |
| **Lambda Function URL** | 100万リクエスト | 約$0.20 |
| **S3** | ストレージ: 1GB、リクエスト: 10,000 | 約$0.03 |
| **Secrets Manager** | 2シークレット | 約$0.80 |
| **CloudWatch Logs** | ログデータ: 5GB/月、Ingestion: 5GB/月、保持3年 | 約$3.97/月（取り込み: $3.80、保存: $0.17/月、累積で増加） |
| **合計** | | **約$4.50/月**（初月）<br>**累積で約$142（3年間）** |

**注意:** 実際のコストは使用量によって変動します。LLM API（OpenAI/Anthropic）への呼び出しコストは別途必要です。

## セキュリティベストプラクティス

1. **APIキーの管理**
   - すべてのAPIキーはSecrets Managerで管理
   - 定期的なローテーションを検討

2. **アクセス制御**
   - Lambda Function URLは必要に応じて認証を追加（現在は`NONE`）
   - CORS設定で許可するオリジンを制限
   - **AWSネットワーク設定（インバウンド設定）により、社内IPアドレスのみアクセスを許可**
     - 既存のネットワーク設定で制御されています
     - ネットワーク設定の変更が必要な場合は、AWS管理者に相談してください

3. **監視とアラート**
   - CloudWatch Logsで異常なアクセスパターンを監視
   - コスト超過アラートを設定

4. **ログ管理**
   - ログには機密情報が含まれる可能性があるため、アクセス権限を適切に管理
   - **ログ保持期間を3年（1095日）に設定**（ステップ9で設定手順を記載）
   - 長期保存により、監査やトラブルシューティングが容易になります

## 参考リンク

- [AWS Lambda Function URLs ドキュメント](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [AWS Lambda Response Streaming](https://docs.aws.amazon.com/lambda/latest/dg/response-streaming.html)
- [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)
- [AWS Secrets Manager ベストプラクティス](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)

## サポート

問題が発生した場合は、以下の情報を添えて開発チームに連絡してください：

- エラーメッセージの全文
- CloudFormationスタックイベント（該当する場合）
- CloudWatch Logsの該当部分
- 実行したコマンドとその出力

---

**最終更新日**: 2025-12-03  
**バージョン**: 1.0

