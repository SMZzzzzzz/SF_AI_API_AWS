# アクセスメタ情報の記録方針

## 取得するフィールド
- `primaryIp`: `X-Forwarded-For` 先頭 / `CF-Connecting-IP` / `True-Client-IP` / API Gateway `sourceIp` の優先順
- `forwardedFor`: `X-Forwarded-For` を分解した全IP一覧
- `cfConnectingIp`, `trueClientIp`: 各種プロキシヘッダー
- `sourceIp`: API Gateway が解決したクライアント IP
- `userAgent`: Continue クライアントから送信された `User-Agent`

## ログ出力先
- `chat_completion` と `streaming_emulated` の両方で `requestMeta` フィールドとして CloudWatch Logs に出力
- 構造例：
  ```json
  {
    "message": "chat_completion",
    "requestMeta": {
      "primaryIp": "203.0.113.10",
      "forwardedFor": ["203.0.113.10", "198.51.100.2"],
      "userAgent": "continue-client/0.7.5"
    }
  }
  ```

## 今後の対応
- Continue 側で `User-Agent` にバージョンや端末情報を含める運用を推奨
- WAF / CloudTrail など他サービスのログと突き合わせる場合は `requestId` をキーとして連携可能

