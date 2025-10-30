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

### max_tokens動的調整機能
- **目的**: コスト削減とエラー回避の両立
- **デフォルト値**: 2000トークン（Continue設定と一致）
- **動作**:
  - 入力値：入力履歴の文字数からトークン数を推定（日本語: 1文字≈0.5トークン）
  - コンテキストウィンドウを考慮して自動調整:
    - Anthropicモデル: 8192トークン
    - OpenAI GPT-5系: 128Kトークン
    - OpenAI その他: 32Kトークン
  - 安全マージンを確保し、コンテキストウィンドウ超過を防止
  - 最低保証値:
    - GPT-5系: 4000トークン（推論トークン考慮）
    - その他: 1000トークン
- **実装ファイル**: `supabase/functions/lib/providers.ts`

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

- 2025-10-30: Anthropic API対応（バージョン2023-06-01）、max_tokens動的調整機能実装
- 2025-10-29: SSEストリーミング実装完了、Continue UI表示問題解決
- 2025-10-28: GPT-5対応、max_tokens調整
- 2025-10-27: 初期実装、OpenAI互換API構築