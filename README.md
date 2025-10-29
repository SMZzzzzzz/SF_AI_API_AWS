# SF AI API - プロジェクト概要

## 概要

Supabase Edge Functionsを使用したOpenAI互換LLMプロキシAPI。Continue IDE拡張機能と連携し、複数のLLMプロバイダー（OpenAI、Anthropic）を統一的に利用できる。

## 現在の状態

✅ **SSEストリーミング実装完了**  
✅ **デプロイ済み**  
✅ **Continue UIで正常動作確認済み**  

## アーキテクチャ

```
Continue IDE
    ↓ (OpenAI互換API)
Supabase Edge Function (llm-proxy-openai)
    ↓ (ルーティング)
OpenAI / Anthropic API
    ↓ (レスポンス)
Continue UI (SSEストリーミング)
```

## 主要ファイル

### Supabase Edge Functions
- `supabase/functions/llm-proxy-openai/index.ts` - メインAPI
- `supabase/functions/lib/` - 共通ライブラリ
- `supabase/migrations/` - データベーススキーマ

### 設定・ドキュメント
- `docs/continue-config-reference.yaml` - Continue設定の参照
- `docs/CONTINUE_SETUP.md` - Continueセットアップガイド
- `docs/continue-troubleshooting.md` - トラブルシューティング
- `model_map.json` - モデルマッピング設定

### デプロイ・テスト
- `deploy.ps1` - デプロイスクリプト
- `test-*.ps1` - 各種テストスクリプト

## 重要な技術仕様

### SSEストリーミング
- `stream: true`でServer-Sent Events形式
- 3つのチャンク形式:
  1. Role通知: `delta: { role: "assistant" }`
  2. 本文: `delta: { content: "..." }`
  3. 終端: `data: [DONE]`

### モデルマッピング
- `backend_developer` → GPT-5-nano
- `frontend_architect` → GPT-4o
- `qa_research` → Claude-3.5-sonnet
- など

### ログ・監視
- `ai_api_logs`テーブルに全リクエスト/レスポンスを記録
- PIIマスキング対応
- コスト計算機能

## セットアップ

1. **Supabaseプロジェクト設定**
   ```bash
   supabase login
   supabase link --project-ref ndiwsfzozeudtenshwgx
   ```

2. **環境変数設定**
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_ANON_KEY`

3. **デプロイ**
   ```powershell
   .\deploy.ps1
   ```

4. **Continue設定**
   - `docs/continue-config-reference.yaml`を参照
   - `C:\Users\<USER>\.continue\config.yaml`にコピー

## トラブルシューティング

- Continue UIに表示されない → `docs/continue-troubleshooting.md`
- APIエラー → Supabase Functions ログを確認
- SSE形式確認 → `docs/CONTINUE_SETUP.md`のテストコマンド

## 更新履歴

- 2025-01-29: SSEストリーミング実装完了、Continue UI表示問題解決
- 2025-01-28: GPT-5対応、max_tokens調整
- 2025-01-27: 初期実装、OpenAI互換API構築