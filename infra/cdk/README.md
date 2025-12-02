# AWS CDK デプロイメント

このディレクトリは、AWS CDKを使用してLambda + API Gateway + S3 + Secrets Managerを構築するためのものです。

## 📋 現状

### 完了済み
- ✅ Lambda関数のリファクタリング完了
- ✅ CDKスタック定義完了
- ✅ デプロイ計画書作成完了

### 次のステップ
1. **デプロイ計画書を確認**: [`DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md)
2. **デプロイ状況を確認**: `.\check-deployment-status.ps1`
3. **デプロイを実行**: `.\deploy.ps1`

## 🚀 クイックスタート

### 1. デプロイ状況の確認

```powershell
.\check-deployment-status.ps1
```

### 2. デプロイの実行

```powershell
.\deploy.ps1
```

### 3. 詳細な手順

詳細なデプロイ手順は [`DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md) を参照してください。

## 📁 ディレクトリ構成

```
infra/cdk/
├── bin/
│   └── cdk.ts              # CDKアプリケーションのエントリーポイント
├── lib/
│   └── cdk-stack.ts        # CDKスタック定義
├── lambda/
│   ├── chat-completions.ts # Lambda関数（リファクタリング完了）
│   ├── helpers.ts          # ヘルパー関数
│   ├── providers.ts        # LLMプロバイダー実装
│   └── types.ts            # 型定義
├── DEPLOYMENT_PLAN.md      # デプロイ計画書（詳細手順）
├── deploy.ps1              # デプロイスクリプト
├── check-deployment-status.ps1  # デプロイ状況確認スクリプト
├── package.json            # 依存関係
├── tsconfig.json           # TypeScript設定
└── cdk.json                # CDK設定
```

## 🔧 開発コマンド

```powershell
# 依存関係のインストール
npm install

# TypeScriptのビルド
npm run build

# CDKの合成（CloudFormationテンプレート生成）
npx cdk synth

# CDKの差分確認
npx cdk diff

# デプロイ
npx cdk deploy

# スタックの削除
npx cdk destroy
```

## 📚 参考資料

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Lambda Function URL Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [デプロイ計画書](DEPLOYMENT_PLAN.md)
