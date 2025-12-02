# 添付ファイル取り扱いフロー

## 検知方法
- リクエストボディのトップレベル `attachments` 配列
- 各 `messages[*].attachments` 配列
- 要素は `{ name, mime_type?, data? }` を想定（`data` は Base64 文字列）

## 保存先
- 監査ログ用 S3 バケット (`AUDIT_LOG_BUCKET_NAME`)
- キー形式: `<AUDIT_LOG_PREFIX>/attachments/YYYY/MM/DD/<ISO>_<requestId>_<index>_<name>`
- Base64 が存在しない場合はメタデータのみ保存（`stored=false`）

## CloudWatch ログ
- `chat_completion` / `streaming_emulated` に `attachments` フィールドを追加
  - `stored`: S3 へ保存できたか
  - `key`: S3 オブジェクトキー
  - `size`: バイト数
  - `sha256`: コンテンツハッシュ

## PII / マスキング
- `LOG_MASK_PII=true` の場合でも添付ファイル自体は暗号化済 S3 に保存
- 監査ログ (S3) にはハッシュとメタデータのみ記録し、CloudWatch 側ではファイル名・ハッシュのみ確認可能

## 運用メモ
- アップロード時に失敗した場合は `stored=false` としてログに記録
- 将来的にウイルススキャン等を行う場合は、S3 バケットのアップロード通知 (EventBridge) に接続可能

