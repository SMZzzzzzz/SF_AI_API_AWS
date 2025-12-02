# 操作前後状態の保存設計

## 保存先
- 新規 S3 バケット `AuditLogBucket`（`infra/cdk/lib/cdk-stack.ts`）
  - 暗号化: S3 管理キー
  - 公開ブロック、SSL 強制、バージョニング有効
  - 削除ポリシー: `RETAIN`
- Lambda 環境変数
  - `AUDIT_LOG_BUCKET_NAME`: バケット名
  - `AUDIT_LOG_PREFIX`: 既定 `audit`

## 格納フォーマット
- キー: `<prefix>/YYYY/MM/DD/<ISO8601>_<requestId>.json`
- コンテンツ
  ```json
  {
    "requestId": "T6ykBhjjtjMEMmA=",
    "timestamp": "2025-11-12T07:04:00.148Z",
    "identity": { "userId": "alice.sato", "source": "header", ... },
    "requestMeta": { "primaryIp": "203.0.113.10", ... },
    "request": {
      "modelAlias": "overall_architect",
      "messages": [...],
      "temperature": 0.3,
      "maxTokens": 2000,
      "streamingRequested": true
    },
    "response": { ... またはマスク済み文字列 ... },
    "usage": { "tokensIn": 120, "tokensOut": 180, "costUsd": 0.0005 }
  }
  ```
- `LOG_MASK_PII=true` の場合はメッセージ内容とレスポンスをマスキングして保存

## CloudWatch との連携
- `chat_completion` / `streaming_emulated` ログ内に `auditLogRef`（`bucket`, `key`, `eTag`）を記録
- Logs Insights から S3 キーで追跡し、詳細は S3 側で取得

## 運用メモ
- S3 バケットへのアクセスは Lambda 実行ロールに `write` 権限のみ付与
- Athena/Glue でカタログ化する場合は、`audit` プレフィックスをテーブルにマッピング
- 長期保管要件に応じて S3 ライフサイクル（Glacier など）を設定

