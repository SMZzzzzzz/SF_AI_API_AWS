# 手動デプロイ手順

## 📋 修正完了

以下の修正が完了しています：
- GPT-5モデルのmax_tokens自動調整（最低4000）
- モデルマッピング修正（"backend" → "backend_developer"）

## 🚀 デプロイ方法

### 方法1: Supabaseダッシュボードから（最も簡単）

1. **ダッシュボードにアクセス**
   - https://supabase.com/dashboard を開く
   - プロジェクト `ndiwsfzozeudtenshwgx` を選択

2. **Edge Functionsを開く**
   - 左メニューから「Edge Functions」をクリック
   - 「llm-proxy-openai」関数を選択

3. **コードを更新**
   - `supabase/functions/llm-proxy-openai/index.ts` の内容をすべてコピー
   - ダッシュボードのエディタに貼り付け

4. **デプロイ**
   - 「Deploy」ボタンをクリック
   - デプロイ完了まで数秒待つ

### 方法2: Supabase CLIで（トークンが必要）

PowerShellで実行：

```powershell
# アクセストークンを環境変数に設定
$env:SUPABASE_ACCESS_TOKEN = "YOUR_ACCESS_TOKEN"

# デプロイ
.\supabase.exe functions deploy llm-proxy-openai
```

アクセストークンの取得：
- Supabaseダッシュボード → Settings → Access Tokens
- または https://supabase.com/dashboard/account/tokens

## ✅ デプロイ後のテスト

デプロイ完了後、以下でテスト：

```powershell
powershell -ExecutionPolicy Bypass -File .\test-after-deploy 어떻게
```

または手動でテスト：

```powershell
powershell -ExecutionPolicy Bypass -File .\simple-api-test.ps1
```

## 🎯 期待される結果

### 修正前
```json
{
  "message": {
    "content": "",  // ← 空
    ...
  },
  "finish_reason": "length"
}
```

### 修正後
```json
{
  "message": {
    "content": "Hello! This is a response.",  // ← 実際のレスポンス
    ...
  },
  "finish_reason": "stop"
}
```

## 📝 確認ポイント

1. ✅ `finish_reason` が "stop" になっている
2. ✅ `content` が空でない
3. ✅ `model` が "gpt-5-nano-2025-08-07" または適切なモデル
4. ✅ 日本語メッセージでも正常にレスポンスが返る

## 🔧 トラブルシューティング

### デプロイエラー
- ブラウザをリロードして再試行
- コードが正しくコピーされているか確認

### テストエラー
- デプロイ完了後、10秒程度待ってからテスト
- Supabaseダッシュボード → Logs でエラーを確認





