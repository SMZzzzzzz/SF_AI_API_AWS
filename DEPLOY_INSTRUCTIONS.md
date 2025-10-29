# デプロイ手順

## 修正内容

以下の修正が完了しました：

### 1. GPT-5モデルのmax_tokens自動調整
- **問題**: GPT-5モデルは推論トークンを消費するため、max_tokensが小さいとコンテンツが空になる
- **修正**: actualModelがGPT-5の場合は、max_tokensを最低4000に調整

### 2. モデルマッピングの修正
- **問題**: "backend"というモデル名がmodel_map.jsonのキーと一致しない
- **修正**: "backend" → "backend_developer"に自動マッピング

## デプロイ方法

### オプション1: Supabaseダッシュボードからデプロイ（推奨）

1. [Supabaseダッシュボード](https://supabase.com/dashboard)にアクセス
2. プロジェクト `ndiwsfzozeudtenshwgx` を選択
3. 左メニューから「Edge Functions」を選択
4. 「llm-proxy-openai」関数を選択
5. コードエディタで `supabase/functions/llm-proxy-openai/index.ts` の内容を貼り付け
6. 「Deploy」ボタンをクリック

### オプション2: Supabase CLIでデプロイ

ターミナルで以下のコマンドを実行：

```powershell
# 現在のディレクトリを確認
cd C:\Users\s_mizuguchi\MCP\SF_AI_API_fresh

# Supabase CLIでログイン（ブラウザが開く）
.\supabase.exe login

# デプロイ
.\supabase.exe functions deploy llm-proxy-openai
```

## デプロイ後のテスト

デプロイが完了したら、以下のコマンドでテスト：

```powershell
powershell -ExecutionPolicy Bypass -File .\test-after-deploy.ps1
```

または、個別にテスト：

```powershell
powershell -ExecutionPolicy Bypass -File .\simple-api-test.ps1
```

## 期待される結果

デプロイ前：
- `finish_reason: "length"`
- `content: ""` (空)
- `completion_tokens_details.reasoning_tokens: 100`

デプロイ後：
- `finish_reason: "stop"`
- `content: "実際のレスポンス内容"`
- レスポンスが正しく返される

## トラブルシューティング

### デプロイエラー
- Supabase CLIがインストールされていることを確認
- ログインが完了していることを確認

### テストエラー
- デプロイが完了してから数秒待つ
- Supabaseダッシュボード → Logs でエラーを確認





