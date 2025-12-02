# Continue IDE セットアップガイド

## 概要

Continue IDEからカスタムLLMルーティングAPI（AWS Lambda Function URL）を呼び出すための設定手順です。役割に応じて最適なモデルを自動選択します。

## 現在の状態

✅ SSEストリーミング実装完了（Lambda Function URL + streamifyResponse）  
✅ デプロイ済み  
✅ Continue UIで正常動作確認済み  
✅ タイムアウト問題解決（最大15分対応）  

## セットアップ手順

### 1. Continue拡張機能のインストール

VS Code/CursorにContinue拡張機能をインストールします。

### 2. 設定ファイルの編集

Continueの設定ファイル（通常は `C:\Users\<USER>\.continue\config.yaml`）を編集します。

### 3. 設定例

`docs/continue-config-reference.yaml`を参照し、以下の設定をコピーします：

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
      timeout: 900000  # 15分 = 900秒（Lambda Function URL使用時は必須）
      headers:
        "User-Agent": "continue-client"
        "Content-Type": "application/json"
```

**重要な設定:**

- `apiBase`: Lambda Function URLのエンドポイント（`/chat/completions`は自動追加されます）
- `stream: true`: SSEストリーミングを有効化（必須）
- `timeout: 900000`: 15分（900秒）のタイムアウト設定（Lambda Function URL使用時は必須）
- `Content-Type: application/json`: リクエストヘッダー

### 4. Continue IDEの再起動

設定ファイルを保存後、VS Code/Cursorを完全に再起動します。

## Lambda Function URL（推奨）

現在のエンドポイント:
```
https://mypgnzvxsryhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws
```

**特徴:**
- 最大15分（900秒）のタイムアウト対応
- `streamifyResponse()`を使用した真のストリーミングレスポンス
- API Gatewayの30秒制限を回避

## モデル名と役割の対応

| モデル名 | 役割 | 実際のモデル |
|----------|------|--------------|
| `overall_architect` | システム全体の仕様統括 | GPT-4o |
| `frontend_architect` | フロントエンド設計 | GPT-4o |
| `frontend_developer` | フロントエンド開発 | GPT-4o |
| `backend_architect` | バックエンド設計 | Claude Sonnet |
| `backend_developer` | バックエンド開発 | GPT-5-nano |
| `qa_research` | QA・リサーチ | Claude Sonnet |

詳細は`model_map.json`を参照してください。

## 使用方法

### 1. モデル選択

Continueのチャットで、上部のモデル選択から適切な役割のモデルを選択します。

### 2. カスタムコマンド使用

Continueのカスタムコマンド機能を使用して、役割別のアシスタントを呼び出すことができます。

### 3. 直接モデル指定

チャット内で直接モデルを指定することも可能です。

## 動作確認

### 1. テストリクエスト

PowerShellで以下のコマンドを実行：

```powershell
$functionUrl = "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
$body = @{
  model = "backend_developer"
  messages = @(@{ role = "user"; content = "テストメッセージです" })
  stream = $true
} | ConvertTo-Json -Depth 10
$headers = @{'Content-Type' = 'application/json'; 'User-Agent' = 'continue-client'}
$response = Invoke-WebRequest -Uri $functionUrl -Method POST -Headers $headers -Body $body -UseBasicParsing
$response.Content
```

期待される出力:
```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: [DONE]
```

### 2. CloudWatch Logsの確認

```powershell
aws logs tail /aws/lambda/SfAiProdStack-ChatCompletionsFunction57B9FADB-lkptogcTLqN6 --since 5m
```

## トラブルシューティング

### よくある問題

1. **Continue UIに表示されない**
   - `stream: true`が設定されているか確認
   - `apiBase`のURLが正しいか確認
   - VS Code/Cursorを完全に再起動

2. **503エラーが発生する**
   - `requestOptions.timeout`が`900000`（15分）に設定されているか確認
   - Lambda Function URLの`InvokeMode`が`RESPONSE_STREAM`に設定されているか確認
   - Lambda関数のタイムアウトが900秒に設定されているか確認

3. **ストリーミングが動作しない**
   - `stream: true`が設定されているか確認
   - Lambda関数のコードで`streamifyResponse()`が使用されているか確認
   - CloudWatch Logsでエラーを確認

4. **タイムアウトエラー**
   - `requestOptions.timeout`を`900000`（15分）に設定
   - Lambda Function URLを使用していることを確認（API Gatewayは30秒制限あり）

詳細は`docs/continue-troubleshooting.md`を参照してください。

## 設定ファイルの場所

- **参照用**: `docs/continue-config-reference.yaml` (このリポジトリに保存)
- **実際の設定**: `C:\Users\<USER>\.continue\config.yaml` (個人環境)

## カスタマイズ

### 新しい役割の追加

1. **model_map.jsonを編集**:
```json
{
  "security": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20240620"
  }
}
```

2. **Continue設定に追加**:
```yaml
- name: "Security Assistant"
  provider: "openai"
  model: "security"
  apiBase: "https://mypgnzvxsryhzhqhjzlo3xsaze0gvkgp.lambda-url.ap-northeast-1.on.aws"
  apiKey: "sk-dummy-key-not-required"
  stream: true
  requestOptions:
    timeout: 900000
```

## 参考リンク

- [Continue IDE ドキュメント](https://docs.continue.dev/)
- [OpenAI API リファレンス](https://platform.openai.com/docs/api-reference)
- [AWS Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [デプロイ手順](./DEPLOYMENT.md)
