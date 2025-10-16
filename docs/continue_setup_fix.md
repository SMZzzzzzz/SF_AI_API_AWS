# Continue IDE 設定ガイド（修正版）

## 問題の解決

Continueは`apiBase + /chat/completions`の形式でエンドポイントにアクセスしますが、Supabaseのエンドポイントは`/functions/v1/chat-completions`です。

## 解決方法

### 方法1: Continueの設定を調整（推奨）

`C:\Users\s_mizuguchi\.continue\config.json`を以下のように設定：

```json
{
  "models": [
    {
      "title": "Backend Assistant",
      "provider": "openai",
      "model": "backend-gpt-4o",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat-completions",
      "apiKey": "dummy-key-not-required",
      "contextLength": 4096
    },
    {
      "title": "Frontend Assistant",
      "provider": "openai",
      "model": "frontend-gpt-4o",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat-completions",
      "apiKey": "dummy-key-not-required",
      "contextLength": 4096
    },
    {
      "title": "DevOps Assistant",
      "provider": "openai",
      "model": "devops-claude",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat-completions",
      "apiKey": "dummy-key-not-required",
      "contextLength": 4096
    }
  ],
  "defaultModel": "Backend Assistant"
}
```

**重要**: `apiBase`に完全なエンドポイントURL（`/chat-completions`まで含む）を指定します。Continueが自動的に`/chat/completions`を追加しようとしますが、この設定により正しいエンドポイントにアクセスされます。

### 使用方法

1. 上記の設定ファイルを保存
2. VS Codeを再起動
3. Continueでモデルを選択してチャット

これで、Continueから独自APIを呼び出せるようになります！

