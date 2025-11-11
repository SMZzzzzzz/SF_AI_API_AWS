# AWS LLM プロキシ環境セットアップガイド (単一環境・低コスト構成)

本ドキュメントは、Supabase 互換の OpenAI API (`POST /chat/completions`) を AWS 上に 1 環境構築するための手順と運用ポイントをまとめたものです。今回実施した改修内容・検証結果を反映しています。

---

## ゴール

- Lambda + API Gateway (HTTP API) による OpenAI 互換 API を `prod` 環境に構築
- モデル解決 (`model_map.json`)、CORS、Secrets、レート制限を AWS サービスで実装
- ログは CloudWatch Logs を中心に運用（最新のユーザー発話を含めて記録）

---

## 推奨アーキテクチャ

| 区分 | サービス |
| ---- | -------- |
| API | Amazon API Gateway (HTTP API) |
| 実行 | AWS Lambda (Node.js 20) |
| 設定 | Amazon S3 (`config/model_map.json`) |
| 秘匿情報 | AWS Secrets Manager (`/sfai/prod/OPENAI_API_KEY`, `/sfai/prod/ANTHROPIC_API_KEY`) |
| 監視 | Amazon CloudWatch Logs / Metrics |
| レート制御 | API Gateway ステージのスロットリング (QPM 換算) |
| セキュリティ | IAM 最小権限、CORS 制限（必要に応じ AWS WAF） |

---

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

---

## CDK プロジェクト

- ディレクトリ: `infra/cdk/`
- スタック名: `SfAiProdStack`

### 主なリソース

| 論理名 | 概要 |
| ------ | ---- |
| `ConfigBucket` | S3 バケット。`config/model_map.json` を格納 |
| `OpenAiApiKey`, `AnthropicApiKey` | Secrets Manager シークレット (`/sfai/prod/...`) |
| `ChatCompletionsFunction` | Lambda (Node.js 20, メモリ 512MB, タイムアウト 30 秒) |
| `ChatLambdaLogGroup` | CloudWatch Logs（保持 14 日） |
| `ChatCompletionsApi` | HTTP API (CORS 設定済み) |
| `ProdStage` | API Gateway ステージ (`stageName = prod`) |

### Lambda ログ構造

`chat_completion` ログに以下のフィールドを出力します（2025-11-11 時点の改修内容）。

| フィールド | 説明 |
| ---------- | ---- |
| `latestUserMessage` | 直近のユーザー発話を全文で記録（社内環境のためマスクなし） |
| `latestUserMessageLength` | 上記文字数 |
| `contextTailPreview` | 履歴全体の末尾 200 文字（Continue などが追加した文脈を参考程度に記録） |
| `tokensIn`, `tokensOut`, `costUsd` | トークン数と試算コスト |

レートリミットチェック (`RATE_LIMIT_QPM`) に引っかかった場合や LLM 呼び出し失敗時は `llm_error` ログを出力します。

---

## デプロイ手順

```powershell
cd infra/cdk

# 初回のみ
cdk bootstrap aws://191241815598/ap-northeast-1

# スタックのデプロイ
cdk deploy SfAiProdStack --require-approval never
```

CloudFormation 出力:

```
SfAiProdStack.ChatApiEndpoint = https://<restid>.execute-api.ap-northeast-1.amazonaws.com/prod
SfAiProdStack.ChatLambdaName   = SfAiProdStack-ChatCompletionsFunction57B9FADB-...
SfAiProdStack.ConfigBucketName = sfaiprodstack-configbucket2112c5ec-...
```

---

## 必須設定

1. **`model_map.json` のアップロード**
   ```powershell
   aws s3 cp model_map.json s3://<ConfigBucketName>/config/model_map.json
   ```

2. **Secrets Manager に API キーを登録**
   ```powershell
   aws secretsmanager put-secret-value \
       --secret-id /sfai/prod/OPENAI_API_KEY \
       --secret-string "<OpenAI_API_Key>"

   aws secretsmanager put-secret-value \
       --secret-id /sfai/prod/ANTHROPIC_API_KEY \
       --secret-string "<Anthropic_API_Key>"
   ```

3. **動作確認**
   ```powershell
   python -c "import json, urllib.request; payload={'model':'backend','messages':[{'role':'user','content':'Hello from AWS test.'}]}; req=urllib.request.Request('https://<restid>.execute-api.ap-northeast-1.amazonaws.com/prod/chat/completions', data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'}); print(urllib.request.urlopen(req).read().decode())"
   ```

4. **CloudWatch Logs の確認**
   ```powershell
   aws logs tail SfAiProdStack-ChatLambdaLogGroup176FAFAE-lDLLZj4XDmH5 --since 5m
   ```

---

## その他

- CORS 許可ドメインは CDK コンテキスト/環境変数で上書き可能 (`ALLOW_ORIGINS`)
- ステージスロットリングは `RATE_LIMIT_QPM` と `burstLimit` で調整
- 追加環境を作成する場合は `environmentName` を CDK コンテキストで切り替え、Secrets / S3 バケット名を環境ごとに分離する

---

## 参考: 改修ハイライト

日付 | 内容
---- | ----
2025-11-11 | CDK プロジェクト初期化、スタック定義、Lambda 実装、API Gateway 設定
2025-11-11 | CloudWatch ログに `latestUserMessage` 等のフィールドを追加
2025-11-11 | プロダクション環境にデプロイし、Python 経由で動作確認済み

---

