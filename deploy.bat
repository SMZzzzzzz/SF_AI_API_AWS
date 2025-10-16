@echo off
echo Supabase Edge Function Deployment Script
echo =====================================

REM Supabase CLIのパス
set SUPABASE_CLI=.\supabase.exe

REM プロジェクト参照IDを設定（実際の値に変更してください）
set PROJECT_REF=ndiwsfzozeudtenshwgx

echo 1. Supabaseにログイン...
%SUPABASE_CLI% login

echo 2. プロジェクトにリンク...
%SUPABASE_CLI% link --project-ref %PROJECT_REF%

echo 3. Edge Functionをデプロイ...
%SUPABASE_CLI% functions deploy llm-proxy

echo 4. デプロイ確認...
%SUPABASE_CLI% functions list

echo.
echo デプロイ完了！
echo エンドポイント: https://%PROJECT_REF%.supabase.co/functions/v1/llm-proxy
echo.
pause
