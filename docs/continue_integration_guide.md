# Continue IDE カスタムAPI設定ガイド

## 概要

Continue IDEからカスタムLLMルーティングAPIを呼び出すための設定手順です。役割に応じて最適なモデルを自動選択します。

## Continue設定手順

### 1. Continue設定ファイルの編集

Continueの設定ファイル（通常は `~/.continue/config.json`）を編集します：

```json
{
  "models": [
    {
      "title": "Custom LLM Router",
      "provider": "openai",
      "model": "gpt-4o",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
      "apiKey": "dummy-key-not-required"
    }
  ],
  "customCommands": [
    {
      "name": "backend-assistant",
      "prompt": "You are a backend development assistant. Help with server-side code, APIs, databases, and system architecture.",
      "model": {
        "provider": "openai",
        "model": "backend-gpt-4o",
        "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
        "apiKey": "dummy-key-not-required"
      }
    },
    {
      "name": "frontend-assistant", 
      "prompt": "You are a frontend development assistant. Help with React, Vue, UI/UX, and client-side development.",
      "model": {
        "provider": "openai",
        "model": "frontend-gpt-4o",
        "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
        "apiKey": "dummy-key-not-required"
      }
    },
    {
      "name": "devops-assistant",
      "prompt": "You are a DevOps assistant. Help with infrastructure, deployment, CI/CD, and system operations.",
      "model": {
        "provider": "openai", 
        "model": "devops-claude",
        "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
        "apiKey": "dummy-key-not-required"
      }
    }
  ]
}
```

### 2. 役割別モデルマッピング

API側で以下のマッピングが実装されています：

| 役割 | モデル名パターン | 実際のモデル |
|------|------------------|--------------|
| Backend | `backend-*`, `api-*`, `server-*` | Claude Sonnet |
| Frontend | `frontend-*`, `react-*`, `vue-*`, `ui-*` | GPT-4o |
| DevOps | `devops-*`, `infrastructure-*`, `deploy-*` | Claude Haiku |
| QA | `qa-*`, `test-*`, `testing-*` | Claude Haiku |
| Data | `data-*`, `analytics-*`, `ml-*` | GPT-4o |

### 3. 使用方法

#### 3.1 基本使用
- Continueのチャットで通常通り質問
- 自動的に役割を判定してモデルを選択

#### 3.2 カスタムコマンド使用
- `@backend-assistant` - バックエンド開発支援
- `@frontend-assistant` - フロントエンド開発支援  
- `@devops-assistant` - DevOps支援

#### 3.3 モデル名で明示的に指定
```
# バックエンド開発用
model: backend-gpt-4o

# フロントエンド開発用
model: frontend-gpt-4o

# DevOps用
model: devops-claude
```

## API仕様

### エンドポイント
```
POST https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/chat/completions
```

### リクエスト形式
```json
{
  "model": "backend-gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "FastAPIでREST APIを作成する方法を教えて"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### レスポンス形式
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "claude-3-5-sonnet-20240620",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "FastAPIでREST APIを作成するには..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 200,
    "total_tokens": 250
  }
}
```

## トラブルシューティング

### よくある問題

1. **リクエストが届かない**
   - Continue設定の`apiBase`が正しいか確認
   - エンドポイントURLが正しいか確認

2. **モデルが切り替わらない**
   - モデル名に役割を示すキーワードが含まれているか確認
   - ログで役割判定が正しく動作しているか確認

3. **認証エラー**
   - `apiKey`は`dummy-key-not-required`で問題なし
   - Supabaseの認証設定を確認

### ログ確認

1. **Supabaseダッシュボード** → Edge Functions → `chat-completions` → Logs
2. **Supabaseダッシュボード** → Edge Functions → `llm-proxy-openai` → Logs
3. **Table Editor** → `ai_api_logs` テーブル

## 高度な設定

### カスタム役割の追加

`model_map.json`を編集して新しい役割を追加：

```json
{
  "security": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20240620"
  },
  "mobile": {
    "provider": "openai", 
    "model": "gpt-4o"
  }
}
```

### プロンプトテンプレート

Continueのカスタムコマンドでプロンプトテンプレートを使用：

```json
{
  "name": "code-reviewer",
  "prompt": "You are an expert code reviewer. Review the following code and provide constructive feedback focusing on:\n1. Code quality and best practices\n2. Performance optimizations\n3. Security considerations\n4. Maintainability\n\nCode to review:",
  "model": {
    "provider": "openai",
    "model": "backend-gpt-4o",
    "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
    "apiKey": "dummy-key-not-required"
  }
}
```

## 参考リンク

- [Continue IDE ドキュメント](https://docs.continue.dev/)
- [OpenAI API リファレンス](https://platform.openai.com/docs/api-reference)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
