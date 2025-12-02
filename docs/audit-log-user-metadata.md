# 利用者識別ログの実装方針

## Continue 側の設定
- 各モデル設定で `user` フィールドに Continue のサインインID（例: 社内メールアドレス）を設定
- `requestOptions.headers` に以下のカスタムヘッダーを追加し、Lambda で受け取れるようにする

```yaml
requestOptions:
  headers:
    "User-Agent": "continue-client"
    "Content-Type": "application/json"
    "X-User-Id": "${CONTINUE_USER_ID}"
    "X-User-Email": "${CONTINUE_USER_EMAIL}"
    "X-User-Name": "${CONTINUE_USER_NAME}"
```

> `${CONTINUE_USER_*}` は Continue のテンプレート変数または OS 環境変数で差し込む想定。未設定時は Lambda 側で `openai-user` にフォールバック。

## Lambda での記録内容
- `resolveUserIdentity` で以下を抽出
  - `userId`: `X-User-Id` → `user` → `openai-user` の優先順
  - `userIdSource`: 取得元を `header` / `body` / `default` で記録
  - `headerUserId`, `bodyUserId`: どちらの値が入力されたかを追跡
- `chat_completion` ログに上記を追加して CloudWatch に保存

## 今後の拡張
- `X-User-Id` を継続的に利用できるよう Continue のサインインプロセスと連携
- 認証基盤と照合する場合は、ヘッダーに署名付きトークンを載せるなど改ざん対策を検討

