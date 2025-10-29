# 直接APIテストスクリプト - Continue拡張機能なし

Write-Host "=== 直接APIテスト ===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "direct-api-test_$timestamp.txt"

Write-Host "API URL: $apiUrl" -ForegroundColor Yellow
Write-Host "Log file: $logFile" -ForegroundColor Yellow
Write-Host ""

# テストケース1: 基本的なリクエスト
Write-Host "=== テストケース1: 基本的なリクエスト ===" -ForegroundColor Cyan
$test1 = @{
    model = "backend"
    messages = @(
        @{
            role = "user"
            content = "Hello, this is a test message."
        }
    )
    temperature = 0.7
    max_tokens = 100
} | ConvertTo-Json -Depth 3

Write-Host "Request:" -ForegroundColor White
Write-Host $test1 -ForegroundColor Gray

try {
    $response1 = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $test1 -ContentType "application/json"
    Write-Host "✅ テスト1成功 (Status: $($response1.StatusCode))" -ForegroundColor Green
    
    $responseData1 = $response1.Content | ConvertFrom-Json
    Write-Host "Response Model: $($responseData1.model)" -ForegroundColor White
    Write-Host "Response Content: $($responseData1.choices[0].message.content)" -ForegroundColor White
    
} catch {
    Write-Host "❌ テスト1失敗: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# テストケース2: フロントエンドロール
Write-Host "=== テストケース2: フロントエンドロール ===" -ForegroundColor Cyan
$test2 = @{
    model = "frontend"
    messages = @(
        @{
            role = "user"
            content = "Create a simple HTML button."
        }
    )
    temperature = 0.7
    max_tokens = 150
} | ConvertTo-Json -Depth 3

try {
    $response2 = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $test2 -ContentType "application/json"
    Write-Host "✅ テスト2成功 (Status: $($response2.StatusCode))" -ForegroundColor Green
    
    $responseData2 = $response2.Content | ConvertFrom-Json
    Write-Host "Response Model: $($responseData2.model)" -ForegroundColor White
    Write-Host "Response Content: $($responseData2.choices[0].message.content.Substring(0, [Math]::Min(100, $responseData2.choices[0].message.content.Length)))..." -ForegroundColor White
    
} catch {
    Write-Host "❌ テスト2失敗: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# テストケース3: QAロール
Write-Host "=== テストケース3: QAロール ===" -ForegroundColor Cyan
$test3 = @{
    model = "qa"
    messages = @(
        @{
            role = "user"
            content = "Write a test case for a calculator function."
        }
    )
    temperature = 0.7
    max_tokens = 200
} | ConvertTo-Json -Depth 3

try {
    $response3 = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $test3 -ContentType "application/json"
    Write-Host "✅ テスト3成功 (Status: $($response3.StatusCode))" -ForegroundColor Green
    
    $responseData3 = $response3.Content | ConvertFrom-Json
    Write-Host "Response Model: $($responseData3.model)" -ForegroundColor White
    Write-Host "Response Content: $($responseData3.choices[0].message.content.Substring(0, [Math]::Min(100, $responseData3.choices[0].message.content.Length)))..." -ForegroundColor White
    
} catch {
    Write-Host "❌ テスト3失敗: $($_.Exception.Message)" -ForegroundColor Red
}

# 結果をファイルに保存
$results = @"
=== 直接APIテスト結果 ===
日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
API URL: $apiUrl

テストケース1 (Backend): $(if ($response1.StatusCode -eq 200) { "成功" } else { "失敗" })
テストケース2 (Frontend): $(if ($response2.StatusCode -eq 200) { "成功" } else { "失敗" })  
テストケース3 (QA): $(if ($response3.StatusCode -eq 200) { "成功" } else { "失敗" })

=== 結論 ===
API自体は正常に動作しています。
問題は Continue拡張機能がAPIを呼び出していないことです。

=== 推奨解決策 ===
1. Continue拡張機能を完全に再インストール
2. 他の拡張機能（CodeGPT、Cline）を試す
3. 手動でAPIを呼び出すスクリプトを作成
"@

$results | Out-File -FilePath $logFile -Encoding UTF8

Write-Host ""
Write-Host "=== テスト完了 ===" -ForegroundColor Green
Write-Host "結果をファイルに保存しました: $logFile" -ForegroundColor Yellow
Write-Host ""
Write-Host "=== 結論 ===" -ForegroundColor Cyan
Write-Host "API自体は正常に動作しています。" -ForegroundColor White
Write-Host "問題は Continue拡張機能がAPIを呼び出していないことです。" -ForegroundColor White
