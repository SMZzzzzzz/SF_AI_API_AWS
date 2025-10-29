# 拡張機能の期待するリクエスト形式をデバッグするスクリプト

Write-Host "=== 拡張機能リクエスト形式デバッグ ===" -ForegroundColor Green
Write-Host ""

# 1. 標準的なOpenAI APIリクエスト形式
Write-Host "1. 標準的なOpenAI APIリクエスト形式:" -ForegroundColor Yellow
$standardRequest = @{
    model = "backend"
    messages = @(
        @{
            role = "user"
            content = "Hello"
        }
    )
    temperature = 0.7
    max_tokens = 100
} | ConvertTo-Json -Depth 3

Write-Host "リクエストボディ:" -ForegroundColor Cyan
Write-Host $standardRequest -ForegroundColor White

try {
    $response = Invoke-WebRequest -Uri "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai" -Method POST -Body $standardRequest -ContentType "application/json"
    Write-Host "✅ 標準形式: 成功 (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ 標準形式: 失敗 - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 2. Continue拡張機能が期待する可能性のある形式
Write-Host "2. Continue拡張機能形式 (stream: false):" -ForegroundColor Yellow
$continueRequest = @{
    model = "backend"
    messages = @(
        @{
            role = "user"
            content = "Hello"
        }
    )
    temperature = 0.7
    max_tokens = 100
    stream = $false
} | ConvertTo-Json -Depth 3

Write-Host "リクエストボディ:" -ForegroundColor Cyan
Write-Host $continueRequest -ForegroundColor White

try {
    $response = Invoke-WebRequest -Uri "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai" -Method POST -Body $continueRequest -ContentType "application/json"
    Write-Host "✅ Continue形式: 成功 (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Continue形式: 失敗 - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 3. Authorization ヘッダー付きリクエスト
Write-Host "3. Authorization ヘッダー付きリクエスト:" -ForegroundColor Yellow
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer sk-dummy-key-not-required"
}

try {
    $response = Invoke-WebRequest -Uri "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai" -Method POST -Body $standardRequest -Headers $headers
    Write-Host "✅ Authorization付き: 成功 (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Authorization付き: 失敗 - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== デバッグ完了 ===" -ForegroundColor Green





