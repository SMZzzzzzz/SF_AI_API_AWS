# 監査ログ要件ギャップ分析

## 現状整理
- **保存先**: CloudWatch Logs `SfAiProdStack-ChatLambdaLogGroup*`
- **保持期間**: `infra/cdk/lib/cdk-stack.ts` で `RetentionDays.TWO_WEEKS`（14日）を指定
- **記録イベント**: Lambda `chat-completions` で `chat_completion` と `streaming_emulated` を出力
- **主なフィールド**
  - `timestamp`, `requestId`
  - `role`, `provider`, `model`, `userId`
  - `tokensIn`, `tokensOut`, `costUsd`
  - `latestUserMessage`, `latestUserMessageLength`
  - `contextTailPreview`（末尾200文字）
- **マスキング**: `LOG_MASK_PII` が `false` のため現在は無効

## 監査要件（今回の追加ニーズ）
1. **利用者識別**: 誰が操作したかを一意に追跡したい  
2. **アクセスメタ情報**: 端末・IP・クライアントバージョンなど
3. **操作前後の状態**: 送信メッセージ全体や応答の保全
4. **添付ファイル**: ファイル名や実体の保管
5. **保持/セキュリティ**: 長期保管、アクセス制御、改ざん検知

## ギャップ
- `userId` は常に `openai-user` → 利用者識別不可
- HTTP ヘッダー情報（`User-Agent`, `X-Forwarded-For` 等）未ログ化
- メッセージ全体とレスポンスの完全保存なし（200文字のみ）
- 添付ファイルを検知/保存する仕組みなし
- CloudWatch 14日保持のみで長期保管・改ざん対策が不足

## 追加検討事項
- Continue 側設定を更新し、`user` とカスタムヘッダーに社内ID等を付与
- Lambda でヘッダー解析・S3書き込みを行うための IAM 権限拡張
- S3 への暗号化保存、タグ/分類によるアクセス制御
- Logs Insights / Athena 用のクエリテンプレート、運用手順の整備

