# Cline IDE統合ガイド

## 概要

Cline（VS Code拡張）を独自のSupabase APIと統合する手順です。

## 📋 前提条件

- VS Code がインストール済み
- Cline 拡張がインストール済み
- 独自API が デプロイ済み: `https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat-completions`

## 🔧 設定手順

### 1. Cline設定画面を開く

VS Code で以下のコマンドを実行：

```
Ctrl+Shift+P → "Cline: Settings"
```

または

```
Ctrl+Shift+P → "Cline: Configure API Settings"
```

### 2. カスタムAPIを設定

**以下の情報を入力：**

#### モデル設定

| 項目 | 値 |
|------|-----|
| **API Provider** | `OpenAI Compatible` / `Custom` |
| **API Base URL** | `https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat-completions` |
| **API Key** | `dummy-key-not-required` |
| **Model** | `backend` |

#### 複数モデル設定

| 役割 | モデル名 |
|------|---------|
| Backend | `backend` |
| Frontend | `frontend` |
| Infrastructure | `infra` |
| QA | `qa` |
| Data | `data` |

### 3. VS Code設定（settings.json）

以下を `C:\Users\s_mizuguchi\AppData\Roaming\Code\User\settings.json` に追加：

```json
{
  "cline.api.provider": "openai",
  "cline.api.baseUrl": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat-completions",
  "cline.api.apiKey": "dummy-key-not-required",
  "cline.api.model": "backend",
  "cline.models": [
    {
      "name": "Backend Assistant",
      "model": "backend",
      "provider": "openai"
    },
    {
      "name": "Frontend Assistant",
      "model": "frontend",
      "provider": "openai"
    },
    {
      "name": "Infrastructure Assistant",
      "model": "infra",
      "provider": "openai"
    },
    {
      "name": "QA Assistant",
      "model": "qa",
      "provider": "openai"
    },
    {
      "name": "Data Assistant",
      "model": "data",
      "provider": "openai"
    }
  ]
}
```

## 🧪 テスト手順

### 1. テストメッセージを送信

1. Cline パネルを開く（VS Code下部）
2. テストメッセージを入力：
   - **英語**: "Hello, can you help me?"
   - **日本語**: "こんにちは、手伝ってもらえますか？"

### 2. レスポンス確認

以下を確認します：

- ✅ **UI にレスポンスが表示される**
- ✅ **英語・日本語両方で動作する**
- ✅ **Supabase ログに記録される**

### 3. ネットワークタブで確認（デバッグ）

```
F12 → Network → 「chat-completions」検索
```

確認事項：
- ✅ **ステータスコード**: 200
- ✅ **リクエスト**: Model が正しく送信されている
- ✅ **レスポンス**: OpenAI 形式で返されている

## 🔗 エンドポイント

| 用途 | URL |
|------|-----|
| **Cline** | `https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat-completions` |
| **内部ルーティング** | `https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai` |
| **基本ルーティング** | `https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy` |

## 📊 ログ確認

Supabase ダッシュボード → Edge Functions → Logs で確認：

```
[chat-completions] Request received
[llm-proxy-openai] Model: backend
[llm-proxy-openai] Response: {...}
```

## 🚨 トラブルシューティング

### UIにレスポンスが表示されない

1. **VS Code を再起動**
2. **Cline を再読み込み** (`Ctrl+Shift+P` → "Reload Window")
3. **ネットワークタブでAPIコールを確認**

### 401 / 403 エラー

**原因**: APIキーの問題

**解決策**:
- APIキーを `dummy-key-not-required` に設定
- Cursor の OpenAI キーを無効化

### 500 エラー（日本語）

**原因**: 文字エンコーディング問題

**解決策**:
- Cline が UTF-8 でエンコーディングしているか確認
- ブラウザの Console でエンコーディングを確認

## ✅ 完了チェックリスト

- [ ] Cline がインストール済み
- [ ] API Base URL が設定済み
- [ ] API キーが設定済み
- [ ] テストメッセージが送信できる
- [ ] レスポンスが表示される
- [ ] Supabase ログに記録される
- [ ] 複数モデルが選択できる

---

**問題が発生した場合:**

1. Supabase ログを確認
2. ネットワークタブでリクエスト/レスポンスを確認
3. VS Code コンソールでエラーメッセージを確認
