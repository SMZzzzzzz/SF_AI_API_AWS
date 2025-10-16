-- 職種別LLMルーティングAPI ログテーブル
-- AI API呼び出しの監査・原価計算用

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

-- インデックス作成（クエリパフォーマンス向上）
create index if not exists idx_ai_api_logs_ts on ai_api_logs (ts);
create index if not exists idx_ai_api_logs_project_provider on ai_api_logs (project_id, provider);
create index if not exists idx_ai_api_logs_user_id on ai_api_logs (user_id);

-- コメント
comment on table ai_api_logs is 'LLM API呼び出しの監査ログ';
comment on column ai_api_logs.ts is 'リクエストタイムスタンプ';
comment on column ai_api_logs.user_id is 'ユーザーID';
comment on column ai_api_logs.project_id is 'プロジェクトID';
comment on column ai_api_logs.provider is 'LLMプロバイダー (openai/anthropic)';
comment on column ai_api_logs.model is '使用モデル名';
comment on column ai_api_logs.prompt is 'プロンプト（PIIマスキング済み）';
comment on column ai_api_logs.response is 'LLM APIレスポンス（JSONB）';
comment on column ai_api_logs.tokens_in is '入力トークン数';
comment on column ai_api_logs.tokens_out is '出力トークン数';
comment on column ai_api_logs.cost_usd is '推定コスト（USD）';
comment on column ai_api_logs.meta is 'メタデータ（tool名など）';

-- RLS（Row Level Security）の設定
ALTER TABLE public.ai_api_logs ENABLE ROW LEVEL SECURITY;

-- service_roleとanonからのアクセスを許可するポリシーを作成（既存チェック）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ai_api_logs' 
        AND policyname = 'Allow service role operations'
    ) THEN
        CREATE POLICY "Allow service role operations" ON public.ai_api_logs
        FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'anon');
    END IF;
END $$;

