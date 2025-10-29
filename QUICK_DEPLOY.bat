@echo off
echo === Supabase Edge Function デプロイ ===
echo.

echo デプロイ開始...
echo.

REM Supabase CLIでログイン（ブラウザが開く）
echo Step 1: ログイン
supabase.exe login
echo.

REM デプロイ実行
echo Step 2: デプロイ実行
supabase.exe functions deploy llm-proxy-openai
echo.

REM デプロイ確認
echo Step 3: デプロイ確認
(call) && (
    echo デプロイ完了！
    echo.
    echo テストを実行しますか？(Y/N)
    set /p choice=
    if /i "%choice%"=="Y" (
        powershell -ExecutionPolicy Bypass -File .\test-after-deploy.ps1
    )
)

pause





