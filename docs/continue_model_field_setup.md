# Continue IDE モデルフィールド設定ガイド

## 概要

モデルフィールドで役割を指定して、最適なLLMを自動選択する設定方法です。

## Continue設定ファイル

`~/.continue/config.json`に以下の設定を追加：

```json
{
  "models": [
    {
      "title": "Backend Assistant",
      "provider": "openai",
      "model": "backend-gpt-4o",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
      "apiKey": "dummy-key-not-required"
    },
    {
      "title": "Frontend Assistant", 
      "provider": "openai",
      "model": "frontend-gpt-4o",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
      "apiKey": "dummy-key-not-required"
    },
    {
      "title": "DevOps Assistant",
      "provider": "openai", 
      "model": "devops-claude",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
      "apiKey": "dummy-key-not-required"
    },
    {
      "title": "QA Assistant",
      "provider": "openai",
      "model": "qa-claude", 
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
      "apiKey": "dummy-key-not-required"
    },
    {
      "title": "Data Assistant",
      "provider": "openai",
      "model": "data-gpt-4o",
      "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1", 
      "apiKey": "dummy-key-not-required"
    }
  ],
  "customCommands": [
    {
      "name": "backend-help",
      "prompt": "You are a backend development assistant. Help with server-side code, APIs, databases, and system architecture.",
      "model": {
        "provider": "openai",
        "model": "backend-gpt-4o",
        "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
        "apiKey": "dummy-key-not-required"
      }
    },
    {
      "name": "frontend-help",
      "prompt": "You are a frontend development assistant. Help with React, Vue, UI/UX, and client-side development.",
      "model": {
        "provider": "openai",
        "model": "frontend-gpt-4o",
        "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
        "apiKey": "dummy-key-not-required"
      }
    },
    {
      "name": "devops-help",
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

## モデル名と役割の対応

| モデル名 | 役割 | 実際のモデル |
|----------|------|--------------|
| `backend-gpt-4o` | Backend | Claude Sonnet |
| `frontend-gpt-4o` | Frontend | GPT-4o |
| `devops-claude` | DevOps | Claude Haiku |
| `qa-claude` | QA | Claude Haiku |
| `data-gpt-4o` | Data | GPT-4o |

## 使用方法

### 1. モデル選択
Continueのチャットで、上部のモデル選択から適切な役割のモデルを選択：

- **Backend Assistant** → `backend-gpt-4o`
- **Frontend Assistant** → `frontend-gpt-4o`  
- **DevOps Assistant** → `devops-claude`

### 2. カスタムコマンド使用
- `@backend-help` - バックエンド開発支援
- `@frontend-help` - フロントエンド開発支援
- `@devops-help` - DevOps支援

### 3. 直接モデル指定
チャット内で直接モデルを指定することも可能：

```
# バックエンド開発用
model: backend-gpt-4o

# フロントエンド開発用  
model: frontend-gpt-4o

# DevOps用
model: devops-claude
```

## 動作確認

### 1. ログ確認
Supabaseダッシュボードで以下を確認：
- Edge Functions → `llm-proxy-openai` → Logs
- 役割判定のログ: `Continue request detected, role: backend from model: backend-gpt-4o`

### 2. データベース確認
Table Editor → `ai_api_logs` テーブルで：
- `provider`と`model`が正しく記録されているか確認
- 日本語プロンプトが正しく表示されているか確認

## トラブルシューティング

### よくある問題

1. **モデルが切り替わらない**
   - モデル名に役割キーワードが含まれているか確認
   - ログで役割判定が正しく動作しているか確認

2. **Continueからリクエストが届かない**
   - `apiBase`のURLが正しいか確認
   - エンドポイント `/functions/v1/chat/completions` が正しく設定されているか確認

3. **認証エラー**
   - `apiKey`は `dummy-key-not-required` で問題なし
   - Supabaseの認証設定を確認

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
```json
{
  "title": "Security Assistant",
  "provider": "openai", 
  "model": "security-claude",
  "apiBase": "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1",
  "apiKey": "dummy-key-not-required"
}
```

3. **コードに役割判定を追加**:
```typescript
} else if (model.includes("security") || model.includes("secure")) {
  role = "security";
}
```

これで、モデルフィールドで役割を指定して最適なLLMを自動選択できるようになります！
