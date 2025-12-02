# SF AI API - プロジェクト概要

## 概要

AWS Lambda Function URLを使用したOpenAI互換LLMプロキシAPI。Continue IDE拡張機能と連携し、複数のLLMプロバイダー（OpenAI、Anthropic）を統一的に利用できます。最大15分（900秒）のタイムアウト対応とストリーミングレスポンスをサポートします。

## 現在の状態

✅ **AWS Lambda Function URL実装完了**  
✅ **SSEストリーミング実装完了**（`streamifyResponse()`使用）  
✅ **デプロイ済み**  
✅ **Continue UIで正常動作確認済み**  
✅ **タイムアウト問題解決**（最大15分対応）  

## アーキテクチャ

```
Continue IDE
    ↓ (OpenAI互換API)
AWS Lambda Function URL
    ↓ (ルーティング)
OpenAI / Anthropic API
    ↓ (レスポンス)
Continue UI (SSEストリーミング)
```

## 主要ファイル

### AWS CDK
- `infra/cdk/lib/cdk-stack.ts` - CDKスタック定義
- `infra/cdk/lambda/chat-completions.ts` - Lambda関数（メインAPI）
- `infra/cdk/deploy.ps1` - CDKデプロイスクリプト
- `infra/cdk/check-deployment-status.ps1` - デプロイ状況確認スクリプト

### 設定・ドキュメント
- `docs/continue-config-reference.yaml` - Continue設定の参照
- `docs/CONTINUE_SETUP.md` - Continueセットアップガイド
- `docs/DEPLOYMENT.md` - デプロイ手順
- `docs/AWS_SETUP.md` - AWS環境セットアップガイド
- `docs/TROUBLESHOOTING.md` - トラブルシューティングガイド
- `model_map.json` - モデルマッピング設定

## 重要な技術仕様

### SSEストリーミング
- `stream: true`でServer-Sent Events形式
- 3つのチャンク形式:
  1. Role通知: `delta: { role: "assistant" }`
  2. 本文: `delta: { content: "..." }`
  3. 終端: `data: [DONE]`

### モデルマッピング
- `backend_developer` → GPT-5-nano
- `frontend_architect` → GPT-4o
- `qa_research` → Claude-3.5-sonnet
- など（詳細は`model_map.json`を参照）

### Lambda Function URL
- 最大15分（900秒）のタイムアウト対応
- `streamifyResponse()`を使用した真のストリーミングレスポンス
- API Gatewayの30秒制限を回避

### ログ・監視
- CloudWatch Logsに全リクエスト/レスポンスを記録
- トークン数とコスト計算機能

## セットアップ

### 1. AWS環境の準備

詳細は`docs/AWS_SETUP.md`を参照してください。

### 2. CDKスタックのデプロイ

```powershell
cd infra/cdk
cdk bootstrap aws://191241815598/ap-northeast-1
cdk deploy SfAiProdStack --require-approval never
```

詳細は`docs/DEPLOYMENT.md`を参照してください。

### 3. Continue設定

`docs/continue-config-reference.yaml`を参照し、`C:\Users\<USER>\.continue\config.yaml`に設定をコピーします。

詳細は`docs/CONTINUE_SETUP.md`を参照してください。

## ドキュメント

- [デプロイ手順](docs/DEPLOYMENT.md) - CDKスタックのデプロイ手順
- [AWS環境セットアップ](docs/AWS_SETUP.md) - AWS環境の構築ガイド
- [Continue IDE セットアップ](docs/CONTINUE_SETUP.md) - Continue IDEの設定方法
- [トラブルシューティング](docs/TROUBLESHOOTING.md) - よくある問題と解決方法

## 更新履歴

- 2025-12-02: Lambda Function URL追加、`streamifyResponse()`実装、タイムアウト15分対応、ストリーミングレスポンス対応完了
- 2025-11-11: CDK プロジェクト初期化、スタック定義、Lambda 実装、CloudWatch ログに `latestUserMessage` 等のフィールドを追加
