# デプロイ手順

## 📋 前提条件

- Supabaseアカウント
- Supabase CLIインストール済み
- OpenAI APIキー
- Anthropic APIキー

## 🚀 ステップ1: Supabaseプロジェクトのセットアップ

### 1.1 Supabase CLIのインストール

```bash
# macOS/Linux
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# npm経由
npm install -g supabase
```

### 1.2 Supabaseにログイン

```bash
supabase login
```

### 1.3 新規プロジェクト作成 or 既存プロジェクトにリンク

**新規作成の場合:**
```bash
# Supabaseダッシュボード (https://app.supabase.com) で新規プロジェクトを作成
# プロジェクト名、リージョン、データベースパスワードを設定
```

**既存プロジェクトの場合:**
```bash
supabase link --project-ref your-project-ref
```

## 🗄️ ステップ2: データベースのセットアップ

### 2.1 マイグレーション実行

```bash
# ローカルSupabaseを起動（テスト用）
supabase start

# マイグレーションを適用
supabase db push
```

### 2.2 テーブル確認

Supabaseダッシュボード → Table Editor で `ai_api_logs` テーブルが作成されていることを確認。

### 2.3 RLS（Row Level Security）の設定

**重要**: テーブル作成後、必ずRLSを設定してください。これにより、Edge Functionからログ保存が正常に動作します。

```sql
-- ai_api_logsテーブルのRLSを有効化
ALTER TABLE public.ai_api_logs ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（念のため）
DROP POLICY IF EXISTS "Allow service role full access" ON public.ai_api_logs;
DROP POLICY IF EXISTS "service_role_only" ON public.ai_api_logs;
DROP POLICY IF EXISTS "Allow all operations on ai_api_logs" ON public.ai_api_logs;
DROP POLICY IF EXISTS "Allow service role access" ON public.ai_api_logs;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.ai_api_logs;

-- service_roleとanonからのアクセスを許可するポリシーを作成
CREATE POLICY "Allow service role operations" ON public.ai_api_logs
FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'anon');

-- ポリシーの確認（オプション）
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'ai_api_logs';
```

## 📦 ステップ3: Storageの設定

### 3.1 バケット作成

Supabaseダッシュボード → Storage → Create bucket

- バケット名: `config`
- 公開設定: **Public**

### 3.2 model_map.jsonのアップロード

**方法1: ダッシュボードから**
1. Storage → config バケットを開く
2. Upload file → `model_map.json` を選択
3. アップロード完了後、URLをコピー

**方法2: CLIから**
```bash
supabase storage cp model_map.json config/model_map.json
```

### 3.3 公開URLの取得

```
https://your-project-ref.supabase.co/storage/v1/object/public/config/model_map.json
```

このURLを後で環境変数に設定します。

## 🔐 ステップ4: Secretsの設定

Edge Functionで使用する環境変数を設定します。

```bash
# OpenAI APIキー
supabase secrets set OPENAI_API_KEY=sk-your-openai-key

# Anthropic APIキー
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Supabase URL（プロジェクト設定から取得）
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co

# Supabase Anon Key（プロジェクト設定 → API から取得）
supabase secrets set SUPABASE_ANON_KEY=your-anon-key

# Model Map URL（ステップ3.3で取得したURL）
supabase secrets set MODEL_MAP_URL=https://your-project-ref.supabase.co/storage/v1/object/public/config/model_map.json

# PIIマスキング有効化
supabase secrets set LOG_MASK_PII=true

# レート制限（1分あたり60リクエスト）
supabase secrets set RATE_LIMIT_QPM=60

# CORS設定（必要に応じて変更、全許可の場合は * ）
supabase secrets set ALLOW_ORIGINS=*
```

### Secretsの確認

```bash
supabase secrets list
```

## 🚀 ステップ5: Edge Functionのデプロイ

### 5.1 デプロイ実行

```bash
# プロジェクトルートで実行
supabase functions deploy llm-proxy

# デプロイ成功すると、エンドポイントURLが表示されます
# https://your-project-ref.supabase.co/functions/v1/llm-proxy
```

### 5.2 デプロイ確認

```bash
# Function一覧を表示
supabase functions list
```

## 🧪 ステップ6: 動作テスト

### 6.1 cURLでテスト

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/llm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "role": "backend",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "user_id": "test-user",
    "project_id": "test-project",
    "temperature": 0.7,
    "max_tokens": 100
  }'
```

### 6.2 レスポンス確認

成功時のレスポンス例:
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620",
  "data": {
    "id": "msg_xxx",
    "content": [...],
    "usage": {...}
  }
}
```

### 6.3 ログ確認

Supabaseダッシュボード → Table Editor → `ai_api_logs` でログが記録されているか確認。

```sql
SELECT * FROM ai_api_logs ORDER BY ts DESC LIMIT 5;
```

**注意**: APIキーが設定されていない場合、エラーログが記録されます。これは正常な動作です。

## 📊 ステップ7: モニタリング設定

### 7.1 Function Logs

Supabaseダッシュボード → Edge Functions → llm-proxy → Logs

- リクエスト数
- エラー率
- 実行時間

### 7.2 Database Insights

Supabaseダッシュボード → Database → Insights

- クエリパフォーマンス
- テーブルサイズ

### 7.3 カスタムクエリ（コスト分析）

```sql
-- 日次コスト集計
SELECT 
  DATE(ts) as date,
  provider,
  COUNT(*) as requests,
  SUM(tokens_in) as total_input_tokens,
  SUM(tokens_out) as total_output_tokens,
  ROUND(SUM(cost_usd)::numeric, 4) as total_cost_usd
FROM ai_api_logs
WHERE ts >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(ts), provider
ORDER BY date DESC;
```

## 🔄 更新手順

### モデルマッピングの変更

1. `model_map.json` を編集
2. Supabase Storageに再アップロード

```bash
supabase storage cp model_map.json config/model_map.json --upsert
```

**再デプロイ不要！** 次回リクエストから新しい設定が適用されます。

### コード変更時の再デプロイ

```bash
# 変更後、再デプロイ
supabase functions deploy llm-proxy
```

### 環境変数の変更

```bash
# 環境変数を更新
supabase secrets set RATE_LIMIT_QPM=100

# 再デプロイ（環境変数変更を反映）
supabase functions deploy llm-proxy
```

## ⚠️ トラブルシューティング

### デプロイエラー

```bash
# 詳細ログを確認
supabase functions deploy llm-proxy --debug
```

### 実行時エラー

```bash
# リアルタイムログ確認
supabase functions logs llm-proxy --follow
```

### データベース接続エラー

- `DATABASE_URL` と `DATABASE_ANON_KEY` が正しく設定されているか確認
- Supabaseダッシュボード → Settings → API でキーを再確認

### ログ保存エラー（RLS関連）

**エラー**: `new row violates row-level security policy for table "ai_api_logs"`

**解決方法**:
```sql
-- RLSをリセット
ALTER TABLE public.ai_api_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_api_logs ENABLE ROW LEVEL SECURITY;

-- 適切なポリシーを作成
CREATE POLICY "Allow service role operations" ON public.ai_api_logs
FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'anon');
```

### LLM API呼び出しエラー

- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` が有効か確認
- APIキーに十分なクレジットがあるか確認

## 🔒 セキュリティチェックリスト

- ✅ APIキーはSecretsで管理（コードに直接記載しない）
- ✅ CORS設定を適切に制限（本番環境では `*` を避ける）
- ✅ レート制限を設定
- ✅ PIIマスキングを有効化
- ✅ データベースのRLS (Row Level Security) を検討
- ✅ 定期的なログ監視

## 📈 本番運用チェックリスト

- ✅ バックアップ設定（Supabase Pro以上で自動バックアップ有効）
- ✅ アラート設定（エラー率、レスポンスタイム）
- ✅ コスト監視ダッシュボード作成
- ✅ ドキュメント整備
- ✅ インシデント対応手順の準備

## 🎯 次のステップ

1. **カスタマイズ**: model_map.jsonに独自のロールを追加
2. **拡張**: RAG統合、キャッシュ機能の実装
3. **AWS移行**: 同じI/FでLambdaに移行可能

## 📚 参考リンク

- [Supabase Edge Functions ドキュメント](https://supabase.com/docs/guides/functions)
- [Supabase CLI リファレンス](https://supabase.com/docs/reference/cli)
- [Deno ドキュメント](https://deno.land/manual)

