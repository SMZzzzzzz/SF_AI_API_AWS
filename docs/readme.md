# 職種別LLMルーティングAPI 設計書（Supabase版 → AWS移行前提）

> 目的：**利用者の職種（ロール）に応じて最適なLLM（Claude/GPT）を自動選択**し、**すべての呼び出しを自社APIで一元管理（ログ・ガバナンス・コスト最適化）**する。

---

## 1. 要件

### 機能要件
- 職種ロール → `{provider, model}` を**設定ファイルでマッピング**し、再デプロイなしで切替。
- 単一エンドポイント：`POST /llm-proxy`
- OpenAI / Anthropic 双方に対応（将来追加も可）
- **アプリ層ログ**（監査/原価計算用）をDBに保存
- 失敗時の**標準化エラー**（HTTP 4xx/5xx + JSON）
- 軽微な**PIIマスキング**（メール/電話/番号列）

### 非機能要件
- セキュア（鍵はENV/Secrets、CORS制御、レート制限）
- 可観測性（ログ→可視化、失敗率/遅延）
- 拡張性（RAG, Re-ranking, キャッシュ追加を想定）

---

## 2. アーキテクチャ概要

```
Client (Cursor/VSCode/CI等)
   ↓ POST /llm-proxy  (role, messages, user_id, project_id)
Supabase Edge Function (Deno)
   ├─ model_map.json を取得（Storage or 公開URL）
   ├─ role → {provider, model} 解決
   ├─ Providerに応じて OpenAI/Anthropic API 呼び出し
   ├─ 監査ログを Supabase(Postgres) へ保存
   └─ 結果をそのまま返却（将来：整形 or SSEも可）
```

将来移行（同I/F維持）：
```
API Gateway → Lambda（同ロジック）
   ↳ S3: model_map.json
   ↳ DynamoDB or S3(JSONL): logs
   ↳ Secrets Manager: API鍵
```

---

## 3. API仕様

### エンドポイント
`POST /llm-proxy`

### リクエスト（JSON）
```json
{
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
}
```

### レスポンス（JSON・透過）
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620",
  "data": { "...": "（各ベンダーの生レスポンス）" }
}
```

### エラー標準化
```json
{ "error": { "code": "BAD_REQUEST", "message": "invalid role" } }
```

---

## 4. 設定（ロール→モデル紐付け）

### `model_map.json`（Storage/公開URL）
```json
{
  "frontend":  { "provider": "openai",   "model": "gpt-4o-mini" },
  "backend":   { "provider": "anthropic","model": "claude-3-5-sonnet-20240620" },
  "infra":     { "provider": "openai",   "model": "gpt-4-turbo" },
  "qa":        { "provider": "anthropic","model": "claude-3-5-haiku" },
  "data":      { "provider": "openai",   "model": "gpt-4o" },
  "_default":  { "provider": "openai",   "model": "gpt-4o-mini" }
}
```

---

## 5. 環境変数（Supabase）

```
OPENAI_API_KEY=sk-***
ANTHROPIC_API_KEY=sk-ant-***
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
MODEL_MAP_URL=https://<your-bucket>.supabase.co/model_map.json
LOG_MASK_PII=true
RATE_LIMIT_QPM=60
ALLOW_ORIGINS=https://your.portal.example,https://app.cursor.sh
```

---

## 6. データベース（ログテーブル）

```sql
create table if not exists ai_api_logs (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  user_id text,
  project_id text,
  provider text check (provider in ('openai','anthropic')),
  model text,
  prompt text,
  response jsonb,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(12,4),
  meta jsonb
);
create index on ai_api_logs (ts);
create index on ai_api_logs (project_id, provider);
```

---

## 7. セキュリティ & ガバナンス
- 鍵管理：ENV → Secrets Manager
- CORSホワイトリスト制御
- user_id署名/JWT
- RateLimit
- PIIマスキング
- 監査ダッシュボード（Athena/QuickSight）

---

## 8. 将来拡張
- RAG統合
- キャッシュ
- コスト自動計算
- SSEストリーミング
- AWS移行時 IaC（CDK/Terraform）
