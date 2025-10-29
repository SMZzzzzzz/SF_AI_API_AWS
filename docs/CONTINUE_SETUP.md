# Continue IDE セットアップガイド

## 現在の状態

✅ SSEストリーミング実装完了  
✅ デプロイ済み  
✅ Continue UIで正常動作確認済み  

## セットアップ手順

1. VS Code/CursorにContinue拡張機能をインストール
2. 以下を参照:
   - 設定ファイル: `docs/continue-config-reference.yaml`
   - トラブルシューティング: `docs/continue-troubleshooting.md`
3. `C:\Users\<USER>\.continue\config.yaml`に設定をコピー

## 重要な設定

- `stream: true` (必須 - SSEで動作するため)
- `apiBase`: Supabase Edge Function URL
- `Content-Type: application/json` ヘッダー

## 設定ファイルの場所

- **参照用**: `docs/continue-config-reference.yaml` (このリポジトリに保存)
- **実際の設定**: `C:\Users\<USER>\.continue\config.yaml` (個人環境)

## トラブルシューティング

問題が発生した場合:

1. `docs/continue-troubleshooting.md`を確認
2. VS Code/Cursorを完全に再起動
3. Continue拡張機能を無効化→有効化
4. Supabase Functions ログを確認

## デプロイコマンド

```powershell
cd C:\Users\s_mizuguchi\MCP\SF_AI_API_fresh
$env:SUPABASE_ACCESS_TOKEN = "sbp_731916625fcbcbe80c9154b64225538a94117769"
.\supabase.exe functions deploy llm-proxy-openai
```

## SSE動作確認

```powershell
$body = '{"model":"backend_developer","messages":[{"role":"user","content":"Test"}],"stream":true}'
$headers = @{'Content-Type' = 'application/json'; 'Authorization' = 'Bearer sk-dummy-key-not-required'}
$response = Invoke-WebRequest -Uri 'https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai/chat/completions' -Method POST -Headers $headers -Body $body -UseBasicParsing
$response.Content
```

期待される出力:
```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: {"id":"chatcmpl-...","object":"chat.completion.chunk",...}
data: [DONE]
```
