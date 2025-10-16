# テスト例

## 基本的なテストケース

### 1. Backend ロール（Claude使用）

```bash
curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "backend",
    "messages": [
      {"role": "system", "content": "You are a precise software architect."},
      {"role": "user", "content": "FastAPIでファイルアップロードAPIのコードを出して"}
    ],
    "user_id": "taro",
    "project_id": "proj-123",
    "temperature": 0.2,
    "max_tokens": 2048,
    "metadata": {"tool": "cursor"}
  }'
```

### 2. Frontend ロール（GPT使用）

```bash
curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "frontend",
    "messages": [
      {"role": "user", "content": "Reactでモーダルコンポーネントを作成してください"}
    ],
    "user_id": "hanako",
    "project_id": "proj-456",
    "temperature": 0.7,
    "max_tokens": 1500
  }'
```

### 3. QA ロール（Claude Haiku使用）

```bash
curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "qa",
    "messages": [
      {"role": "user", "content": "このAPIのテストケースを10個考えて"}
    ],
    "user_id": "test-user",
    "project_id": "proj-789",
    "temperature": 0.5,
    "max_tokens": 1000
  }'
```

### 4. 未定義ロール（デフォルト使用）

```bash
curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "unknown-role",
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "user_id": "user-1",
    "project_id": "proj-999",
    "max_tokens": 100
  }'
```

## エラーケースのテスト

### 5. バリデーションエラー - roleなし

```bash
curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "user_id": "user-1",
    "project_id": "proj-1"
  }'
```

期待されるレスポンス:
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "role is required"
  }
}
```

### 6. バリデーションエラー - messagesが空

```bash
curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "backend",
    "messages": [],
    "user_id": "user-1",
    "project_id": "proj-1"
  }'
```

期待されるレスポンス:
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "messages cannot be empty"
  }
}
```

### 7. レート制限テスト

```bash
# 短時間に大量リクエストを送信（RATE_LIMIT_QPMを超える）
for i in {1..70}; do
  curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
    -H "Content-Type: application/json" \
    -d "{
      \"role\": \"backend\",
      \"messages\": [{\"role\": \"user\", \"content\": \"Test $i\"}],
      \"user_id\": \"rate-test-user\",
      \"project_id\": \"proj-rate\"
    }" &
done
wait
```

期待されるレスポンス（制限超過時）:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded: 60 requests per minute"
  }
}
```

## プログラムからの利用例

### Python

```python
import requests
import json

def call_llm_api(role: str, messages: list, user_id: str, project_id: str):
    url = "https://your-project.supabase.co/functions/v1/llm-proxy"
    
    payload = {
        "role": role,
        "messages": messages,
        "user_id": user_id,
        "project_id": project_id,
        "temperature": 0.7,
        "max_tokens": 2000
    }
    
    response = requests.post(url, json=payload)
    return response.json()

# 使用例
result = call_llm_api(
    role="backend",
    messages=[
        {"role": "system", "content": "You are a Python expert."},
        {"role": "user", "content": "Flaskでシンプルなブログアプリを作って"}
    ],
    user_id="python-user",
    project_id="python-proj"
)

print(f"Provider: {result['provider']}")
print(f"Model: {result['model']}")
print(f"Response: {result['data']}")
```

### TypeScript/Node.js

```typescript
async function callLLMAPI(
  role: string,
  messages: Array<{ role: string; content: string }>,
  userId: string,
  projectId: string
) {
  const response = await fetch(
    "https://your-project.supabase.co/functions/v1/llm-proxy",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role,
        messages,
        user_id: userId,
        project_id: projectId,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error: ${error.error.message}`);
  }

  return await response.json();
}

// 使用例
const result = await callLLMAPI(
  "frontend",
  [
    { role: "system", content: "You are a React expert." },
    { role: "user", content: "Next.jsでSSR対応のページを作って" },
  ],
  "ts-user",
  "ts-proj"
);

console.log(`Provider: ${result.provider}`);
console.log(`Model: ${result.model}`);
console.log(`Response:`, result.data);
```

### JavaScript (Fetch API)

```javascript
async function callLLM(role, userMessage) {
  try {
    const response = await fetch(
      'https://your-project.supabase.co/functions/v1/llm-proxy',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: role,
          messages: [
            { role: 'user', content: userMessage }
          ],
          user_id: 'web-user',
          project_id: 'web-app',
          temperature: 0.7,
          max_tokens: 1500
        })
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Error:', data.error);
      return;
    }

    console.log('Provider:', data.provider);
    console.log('Model:', data.model);
    console.log('Response:', data.data);
    
    return data;
  } catch (error) {
    console.error('Request failed:', error);
  }
}

// 使用例
callLLM('frontend', 'Vueでカレンダーコンポーネントを作って');
```

## パフォーマンステスト

### 並列リクエスト

```bash
#!/bin/bash

# 10個の並列リクエストを送信
for i in {1..10}; do
  (
    time curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy \
      -H "Content-Type: application/json" \
      -d "{
        \"role\": \"backend\",
        \"messages\": [{\"role\": \"user\", \"content\": \"Request $i\"}],
        \"user_id\": \"perf-user-$i\",
        \"project_id\": \"perf-proj\",
        \"max_tokens\": 50
      }"
  ) &
done

wait
echo "All requests completed"
```

## ログ分析クエリ

テスト後、以下のSQLでログを分析：

```sql
-- 最新のテストリクエスト
SELECT 
  id,
  ts,
  user_id,
  provider,
  model,
  tokens_in,
  tokens_out,
  cost_usd
FROM ai_api_logs
WHERE project_id LIKE 'proj-%'
ORDER BY ts DESC
LIMIT 20;

-- エラー率の確認
SELECT 
  user_id,
  COUNT(*) as total_requests,
  SUM(CASE WHEN response->>'error' IS NOT NULL THEN 1 ELSE 0 END) as errors,
  ROUND(100.0 * SUM(CASE WHEN response->>'error' IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as error_rate_pct
FROM ai_api_logs
WHERE ts >= NOW() - INTERVAL '1 hour'
GROUP BY user_id;

-- プロバイダー別パフォーマンス
SELECT 
  provider,
  model,
  COUNT(*) as requests,
  AVG(tokens_in) as avg_tokens_in,
  AVG(tokens_out) as avg_tokens_out,
  AVG(cost_usd) as avg_cost_usd
FROM ai_api_logs
WHERE ts >= NOW() - INTERVAL '1 day'
GROUP BY provider, model;
```

