# Supabase Edge Function Deployment Script
# PowerShell版

Write-Host "Supabase Edge Function Deployment Script" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

# Supabase CLIのパス
$SUPABASE_CLI = ".\supabase.exe"

# プロジェクト参照IDを設定（実際の値に変更してください）
$PROJECT_REF = "ndiwsfzozeudtenshwgx"

try {
    Write-Host "1. Supabaseにログイン..." -ForegroundColor Yellow
    & $SUPABASE_CLI login
    
    Write-Host "2. プロジェクトにリンク..." -ForegroundColor Yellow
    & $SUPABASE_CLI link --project-ref $PROJECT_REF
    
    Write-Host "3. Edge Functionをデプロイ..." -ForegroundColor Yellow
    & $SUPABASE_CLI functions deploy llm-proxy
    
    Write-Host "4. デプロイ確認..." -ForegroundColor Yellow
    & $SUPABASE_CLI functions list
    
    Write-Host ""
    Write-Host "デプロイ完了！" -ForegroundColor Green
    Write-Host "エンドポイント: https://$PROJECT_REF.supabase.co/functions/v1/llm-proxy" -ForegroundColor Cyan
    
} catch {
    Write-Host "エラーが発生しました: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "手動でデプロイする場合:" -ForegroundColor Yellow
    Write-Host "1. https://supabase.com/dashboard にアクセス" -ForegroundColor White
    Write-Host "2. プロジェクトを選択" -ForegroundColor White
    Write-Host "3. Settings > API でプロジェクト参照IDを確認" -ForegroundColor White
    Write-Host "4. 以下のコマンドを実行:" -ForegroundColor White
    Write-Host "   .\supabase.exe login" -ForegroundColor Gray
    Write-Host "   .\supabase.exe link --project-ref YOUR_PROJECT_REF" -ForegroundColor Gray
    Write-Host "   .\supabase.exe functions deploy llm-proxy" -ForegroundColor Gray
}
