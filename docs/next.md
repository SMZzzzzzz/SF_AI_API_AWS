# APIキー設定後の手順

## 🎯 概要

職種別LLMルーティングAPIの実装が完了しました。APIキーを設定すれば、すぐに使用開始できます。

---

## 📋 前提条件

✅ **完了済み：**
- データベーステーブル作成完了
- **RLS（Row Level Security）設定完了** ← 重要！
- Storageバケットとmodel_map.jsonアップロード完了
- 環境変数（基本設定）完了
- Edge Functionデプロイ完了
- エラーログ保存機能動作確認完了

⏳ **次に必要な作業：**
- OpenAI APIキーの取得・設定
- Anthropic APIキーの取得・設定
- 最終動作テスト

---

## 🔑 APIキーの取得

### 1. OpenAI APIキーの取得

1. **OpenAI Platform**にアクセス
   - https://platform.openai.com/api-keys

2. **ログイン**（アカウントがない場合は作成）

3. **APIキーを生成**
   - 「Create new secret key」をクリック
   - 名前を入力（例：`LLM-Routing-API`）
   - 「Create secret key」をクリック
   - **生成されたキーをコピー**（一度しか表示されません！）
   - 形式：`sk-proj-...` または `sk-...`

4. **クレジット残高を確認**
   - 左メニュー → 「Usage」で残高を確認
   - 十分なクレジットがあることを確認

### 2. Anthropic APIキーの取得

1. **Anthropic Console**にアクセス
   - https://console.anthropic.com/settings/keys

2. **ログイン**（アカウントがない場合は作成）

3. **APIキーを生成**
   - 「Create Key」をクリック
   - 名前を入力（例：`LLM-Routing-API`）
   - 「Create Key」をクリック
   - **生成されたキーをコピー**（一度しか表示されません！）
   - 形式：`sk-ant-...`

4. **クレジット残高を確認**
   - 左メニュー → 「Usage」で残高を確認
   - 十分なクレジットがあることを確認

---

## ⚙️ 環境変数の設定

### 手順：

1. **Supabaseダッシュボード**にアクセス
   - https://app.supabase.com/project/ndiwsfzozeudtenshwgx

2. **Project Settings** → **Edge Functions** → **Secrets**

3. **Add new secret**で以下を追加：

| Secret Name | Value |
|-------------|-------|
| `OPENAI_API_KEY` | あなたのOpenAI APIキー（sk-...） |
| `ANTHROPIC_API_KEY` | あなたのAnthropic APIキー（sk-ant-...） |

### 設定確認

すべての環境変数が設定されていることを確認：

| Secret Name | 設定状況 |
|-------------|----------|
| `DATABASE_URL` | ✅ |
| `DATABASE_ANON_KEY` | ✅ |
| `MODEL_MAP_URL` | ✅ |
| `LOG_MASK_PII` | ✅ |
| `RATE_LIMIT_QPM` | ✅ |
| `ALLOW_ORIGINS` | ✅ |
| `OPENAI_API_KEY` | ⏳ **新規追加** |
| `ANTHROPIC_API_KEY` | ⏳ **新規追加** |

---

## 🧪 動作テスト

### 1. 基本的な動作テスト

```bash
curl -X POST https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "backend",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello! Please respond with a simple greeting."}
    ],
    "user_id": "test-user",
    "project_id": "test-project",
    "temperature": 0.7,
    "max_tokens": 100
  }'
```

### 2. 期待されるレスポンス

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620",
  "data": {
    "id": "msg_...",
    "content": [
      {
        "text": "Hello! Nice to meet you. How can I help you today?",
        "type": "text"
      }
    ],
    "usage": {
      "input_tokens": 25,
      "output_tokens": 18
    }
  }
}
```

### 3. PowerShellでのテスト

```powershell
$body = @{
  role = "frontend"
  messages = @(
    @{ role = "user"; content = "Create a simple React component for a button" }
  )
  user_id = "test-user"
  project_id = "test-project"
  temperature = 0.7
  max_tokens = 200
} | ConvertTo-Json -Depth 3

try {
  $response = Invoke-WebRequest -Uri "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy" -Method POST -Body $body -ContentType "application/json"
  $response.Content
} catch {
  $_.Exception.Response.GetResponseStream() | ForEach-Object {
    $reader = New-Object System.IO.StreamReader($_)
    $reader.ReadToEnd()
  }
}
```

---

## 📊 ログ確認

### 1. データベースログの確認

**Supabaseダッシュボード** → **Table Editor** → `ai_api_logs`テーブル

```sql
-- 最新のログを確認
SELECT * FROM ai_api_logs ORDER BY ts DESC LIMIT 10;

-- 成功したリクエストのみ表示
SELECT 
  ts,
  user_id,
  project_id,
  provider,
  model,
  tokens_in,
  tokens_out,
  cost_usd
FROM ai_api_logs 
WHERE response->>'error' IS NULL
ORDER BY ts DESC;

-- コスト集計
SELECT 
  provider,
  model,
  COUNT(*) as request_count,
  SUM(tokens_in) as total_input_tokens,
  SUM(tokens_out) as total_output_tokens,
  ROUND(SUM(cost_usd)::numeric, 4) as total_cost_usd
FROM ai_api_logs
WHERE ts >= CURRENT_DATE
GROUP BY provider, model
ORDER BY total_cost_usd DESC;
```

### 2. Edge Functionログの確認

**Supabaseダッシュボード** → **Edge Functions** → **llm-proxy** → **Logs**

- リクエスト数
- エラー率
- 実行時間

---

## 🎯 ロール別テスト

### 1. Backend（Claude Sonnet）

```bash
curl -X POST https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "backend",
    "messages": [{"role": "user", "content": "FastAPIでREST APIを作成してください"}],
    "user_id": "backend-user",
    "project_id": "backend-proj"
  }'
```

### 2. Frontend（GPT-4o-mini）

```bash
curl -X POST https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "frontend",
    "messages": [{"role": "user", "content": "Reactでモーダルコンポーネントを作成してください"}],
    "user_id": "frontend-user",
    "project_id": "frontend-proj"
  }'
```

### 3. QA（Claude Haiku）

```bash
curl -X POST https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "qa",
    "messages": [{"role": "user", "content": "このAPIのテストケースを10個考えて"}],
    "user_id": "qa-user",
    "project_id": "qa-proj"
  }'
```

---

## 🔧 カスタマイズ

### 1. 新しいロールの追加

`model_map.json`を編集：

```json
{
  "frontend": { "provider": "openai", "model": "gpt-4o-mini" },
  "backend": { "provider": "anthropic", "model": "claude-3-5-sonnet-20240620" },
  "devops": { "provider": "openai", "model": "gpt-4o" },
  "qa": { "provider": "anthropic", "model": "claude-3-5-haiku" },
  "_default": { "provider": "openai", "model": "gpt-4o-mini" }
}
```

**Supabase Storage**に再アップロード：
1. Storage → `config` バケット
2. `model_map.json` を削除
3. 新しいファイルをアップロード

**再デプロイ不要！** 次回リクエストから新しい設定が適用されます。

### 2. レート制限の調整

**Project Settings** → **Edge Functions** → **Secrets**で：

```
RATE_LIMIT_QPM = 100  # 1分あたり100リクエスト
```

変更後、Edge Functionを再デプロイ：

```bash
npx supabase functions deploy llm-proxy
```

### 3. CORS設定の変更

本番環境では `ALLOW_ORIGINS` を制限：

```
ALLOW_ORIGINS = https://yourdomain.com,https://app.yourdomain.com
```

---

## 🚀 本番運用

### 1. セキュリティ強化

```sql
-- より厳格なRLSポリシー（オプション）
DROP POLICY IF EXISTS "Allow service role operations" ON public.ai_api_logs;

CREATE POLICY "service_role_only" ON public.ai_api_logs
FOR ALL USING (auth.role() = 'service_role');
```

### 2. モニタリング設定

- **アラート設定**：エラー率、レスポンスタイム
- **コスト監視**：日次・月次コストレポート
- **ログ分析**：使用パターンの分析

### 3. バックアップ設定

- Supabase Pro以上で自動バックアップ有効
- 定期的なログアーカイブ

---

## 📚 使用方法

### Cursorでの使用

1. Cursor設定を開く
2. Advanced → Custom LLM Endpoint
3. エンドポイントURLを設定：`https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy`

### プログラムからの使用

```typescript
async function callLLMAPI(role: string, messages: any[]) {
  const response = await fetch('https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role,
      messages,
      user_id: 'your-user-id',
      project_id: 'your-project-id',
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  const data = await response.json();
  return data;
}
```

---

## 🎉 完了！

APIキーを設定してテストが成功すれば、**職種別LLMルーティングAPI**が完全に動作します！

### エンドポイント
```
https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy
```

### 特徴
- 🎯 **職種に応じた最適なLLM自動選択**
- 🔒 **セキュアな環境変数管理**
- 📊 **完全な監査ログ機能**
- 🚀 **本番環境で即座に使用可能**

---

## 📞 サポート

問題が発生した場合：
1. **ログ確認**：Supabaseダッシュボード → Edge Functions → Logs
2. **ドキュメント確認**：`README.md`、`DEPLOYMENT.md`
3. **Issue作成**：GitHub Issues

Happy coding! 🎉
