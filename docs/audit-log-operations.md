# 監査ログ運用ガイド

## IAM ポリシー
- Lambda 実行ロール
  - `s3:GetObject` / `s3:PutObject` 対象: `ConfigBucket`（モデルマップ）および `AuditLogBucket`
  - `logs:*`（既存）・Secrets Manager 読み取り（既存）
- 人手による調査
  - CloudWatch Logs: `logs:StartQuery`, `logs:GetQueryResults`, `logs:GetLogEvents`
  - S3 監査バケット: 読取は監査チームの IAM ロールに限定し、`s3:GetObject`, `s3:ListBucket` のみ付与

## データ保持戦略
- CloudWatch Logs: 14日（CDKで `RetentionDays.TWO_WEEKS`）
- S3 監査バケット: `RETAIN` 設定のため自動削除なし。ライフサイクルルール例
  - 90日後に Glacier Deep Archive へ移行
  - 3年経過で自動削除
- 監査要件に応じて CloudWatch ログのエクスポートを定期実行し、S3へ集約することを推奨

## セキュリティ
- S3 はバージョニング＋暗号化（SSE-S3）＋パブリックアクセスブロック、SSL 強制
- CloudTrail で `PutObject` イベントを監査し、改ざんや不正アップロードを検知
- `LOG_MASK_PII` 環境変数を `true` に設定すると、メッセージやレスポンスをマスクした上で保存
- 添付ファイル保存時に `sha256` を記録しているため、取得後に改ざん検知が可能

## 運用プロセス
1. Logs Insights で `requestId` または `auditLogRef.key` を検索
2. 必要に応じて S3 から該当オブジェクトを取得
3. 添付ファイルがある場合は S3 の `attachments/` プレフィックスからダウンロード
4. 調査結果は別途チケットや監査レポートへ記録

## 追加検討事項
- S3 アップロードイベントを EventBridge で捕捉し、ウイルススキャンや DLP を実施
- 監査ログを Athena で検索するための Glue カタログを整備
- SOC/CSIRT 向けにダッシュボード（CloudWatch Dashboard / QuickSight）を用意し、アクセス傾向を可視化

