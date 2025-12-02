# Continue IDE設定ファイル更新手順

## 問題

現在、Continue IDEの設定ファイルでAPI Gatewayのエンドポイント（`https://tsf5lltym4.execute-api.ap-northeast-1.amazonaws.com/prod`）が使用されています。API Gatewayには30秒のタイムアウト制限があるため、約1分10秒で503エラーが発生しています。

## 解決策

Continue IDEの設定ファイルの`apiBase`をLambda Function URLに変更します。

## 更新手順

1. Continue IDEの設定ファイルを開く
   - ファイルパス: `C:\Users\s_mizuguchi\.continue\config.yaml`

2. 各モデルの`apiBase`を以下のように変更：

   **変更前:**
   ```yaml
   apiBase: "https://tsf5lltym4.execute-api.ap-northeast-1.amazonaws.com/prod"
   ```

   **変更後:**
   ```yaml
   apiBase: "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
   ```

3. 変更が必要なモデル:
   - Overall Architect
   - Frontend Architect
   - Frontend Developer
   - Backend Architect
   - Backend Developer

4. Continue IDEを再起動
   - VS Code/Cursorを完全に終了
   - 再起動後、Continue IDEパネルを開く

5. テストリクエストを送信して動作確認

## 注意事項

- Continue IDEは`apiBase`に`/chat/completions`を自動追加します
- Lambda Function URLのエンドポイントはパスを直接サポートしていないため、Lambda関数内でパスを処理します
- Lambda Function URLには最大15分（900秒）のタイムアウトが可能です

## 更新後の設定例

```yaml
name: "LLM Proxy API Agent"
version: "1.0.0"
models:
  - name: "Overall Architect"
    provider: "openai"
    model: "overall_architect"
    apiBase: "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
    apiKey: "sk-dummy-key-not-required"
    contextLength: 8192
    template: "あなたはシステム全体の仕様統括の専門家です。システム全体の設計、統括、アーキテクチャの意思決定について詳しく回答してください。\n\n{{message}}"
    stream: true
    completionOptions:
      temperature: 0.3
      maxTokens: 2000
    requestOptions:
      timeout: 900000
      headers:
        "User-Agent": "continue-client"
        "Content-Type": "application/json"
        "X-User-Id": "${env:USERNAME}"
        "X-Windows-User": "${env:USERNAME}"
        "X-Machine-Name": "${env:COMPUTERNAME}"
        "X-Windows-Account": "${env:USERDOMAIN}\\${env:USERNAME}"
```

## トラブルシューティング

問題が発生した場合：
1. CloudWatch Logsで`isFunctionUrl`が`true`になっているか確認
2. Lambda Function URLのエンドポイントが正しく動作しているか確認
3. Continue IDEのログを確認

