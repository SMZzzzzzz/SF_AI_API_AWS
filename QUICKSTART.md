# クイックスタートガイド

5分で職種別LLMルーティングAPIをデプロイ！

## ⚡ 最速デプロイ（5ステップ）

### 1️⃣ 前提条件を確認

```bash
# Supabase CLIがインストールされているか確認
supabase --version

# なければインストール
# macOS
brew install supabase/tap/supabase

# npm
npm install -g supabase
```

### 2️⃣ Supabaseプロジェクトをセットアップ

```bash
# ログイン
supabase login

# プロジェクトにリンク（既存の場合）
supabase link --project-ref your-project-ref

# または、Webダッシュボードで新規プロジェクト作成
# https://app.supabase.com
```

### 3️⃣ データベースとStorageをセットアップ

```bash
# データベーステーブルを作成
supabase db push
```

**重要**: テーブル作成後、RLS（Row Level Security）を設定してください。

Supabaseダッシュボード → **SQL Editor** で以下を実行：

```sql
-- ai_api_logsテーブルのRLSを有効化
ALTER TABLE public.ai_api_logs ENABLE ROW LEVEL SECURITY;

-- service_roleとanonからのアクセスを許可するポリシーを作成
CREATE POLICY "Allow service role operations" ON public.ai_api_logs
FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'anon');
```

その後、Webダッシュボードから:
# 1. Storage → Create bucket → 名前: "config", Public: ON
# 2. config バケットに model_map.json をアップロード

### 4️⃣ 環境変数を設定

```bash
# APIキー設定
supabase secrets set OPENAI_API_KEY=sk-your-openai-key
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Supabase情報（プロジェクト設定から取得）
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_ANON_KEY=your-anon-key

# model_map.jsonのURL
supabase secrets set MODEL_MAP_URL=https://your-project.supabase.co/storage/v1/object/public/config/model_map.json

# その他
supabase secrets set LOG_MASK_PII=true
supabase secrets set RATE_LIMIT_QPM=60
supabase secrets set ALLOW_ORIGINS=*
```

### 5️⃣ デプロイ！

```bash
# Edge Functionをデプロイ（OpenAI互換）
supabase functions deploy llm-proxy-openai

# ✅ デプロイ完了！
# エンドポイント: https://your-project.supabase.co/functions/v1/llm-proxy-openai
```

## 🧪 動作確認

```bash
curl -X POST https://your-project.supabase.co/functions/v1/llm-proxy-openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "backend",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

期待される出力:
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20240620",
  "data": { ... }
}
```

## 📊 ログを確認

Supabaseダッシュボード → Table Editor → `ai_api_logs`

```sql
SELECT * FROM ai_api_logs ORDER BY ts DESC LIMIT 5;
```

## 🎉 完了！

これでAPIが稼働しています！

### 次にやること

- [ ] `model_map.json` をカスタマイズ
- [ ] CORS設定を本番用に変更
- [ ] ログダッシュボードを作成
- [ ] コスト監視を設定

## 📚 詳細ドキュメント

- [README.md](README.md) - 全体概要
- [DEPLOYMENT.md](DEPLOYMENT.md) - 詳細なデプロイ手順
- [TEST_EXAMPLES.md](TEST_EXAMPLES.md) - テストケース集
- [ARCHITECTURE.md](ARCHITECTURE.md) - アーキテクチャ詳細

## 💡 よくある質問

### Q: APIキーが無効と言われる

A: `supabase secrets list` で環境変数が正しく設定されているか確認

### Q: model_map.jsonが見つからない

A: URLが正しいか確認。ブラウザでURLを開いてJSONが表示されるか確認

### Q: レート制限を変更したい

```bash
supabase secrets set RATE_LIMIT_QPM=100
supabase functions deploy llm-proxy-openai
```

### Q: ログが保存されない

A: 以下を確認してください：
1. `DATABASE_URL` と `DATABASE_ANON_KEY` が正しく設定されているか
2. RLS（Row Level Security）が正しく設定されているか

**RLSエラーの場合**:
```sql
-- RLSをリセット
ALTER TABLE public.ai_api_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_api_logs ENABLE ROW LEVEL SECURITY;

-- 適切なポリシーを作成
CREATE POLICY "Allow service role operations" ON public.ai_api_logs
FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'anon');
```

### Q: 特定のロールでエラーが出る

A: `model_map.json` にそのロールが定義されているか確認

## 🆘 トラブルシューティング

```bash
# リアルタイムログを確認
supabase functions logs llm-proxy --follow

# デプロイ状態を確認
supabase functions list

# 環境変数を確認
supabase secrets list
```

## 🚀 カスタマイズ例

### 新しいロールを追加

1. `model_map.json` を編集:
```json
{
  "devops": {
    "provider": "openai",
    "model": "gpt-4o"
  }
}
```

2. Supabase Storageに再アップロード

3. 即座に利用可能（再デプロイ不要）！

### レート制限を緩和

```bash
supabase secrets set RATE_LIMIT_QPM=200
supabase functions deploy llm-proxy
```

### PIIマスキングを無効化

```bash
supabase secrets set LOG_MASK_PII=false
supabase functions deploy llm-proxy-openai
```

## 📞 サポート

問題が発生した場合:
1. ログを確認: `supabase functions logs llm-proxy-openai`
2. ドキュメントを確認: [DEPLOYMENT.md](DEPLOYMENT.md)
3. Issueを作成: GitHub Issues

Happy coding! 🎉

