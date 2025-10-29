# Test API after deployment with GPT-5 fix

Write-Host "=== Test After Deployment ===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

# Test 1: Backend with default tokens (should auto-adjust to 4000)
Write-Host "=== Test 1: Backend with default max_tokens ===" -ForegroundColor Cyan
$requestBody1 = @{
    model = "backend"
    messages = @(
        @{
            role = "user"
            content = "Hello, please say hi back."
        }
    )
    temperature = 0.7
    max_tokens = 100
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody1 -ContentType "application/json"
    $responseData = $response.Content | ConvertFrom-Json
    
    Write-Host "Response Content: $($responseData.choices[0].message.content)" -ForegroundColor $(if ($responseData.choices[0].message.content) { "Green" } else { "Red" })
    Write-Host "Finish Reason: $($responseData.choices[0].finish_reason)" -ForegroundColor Yellow
    Write-Host "Model: $($responseData.model)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Japanese message
Write-Host "=== Test 2: Japanese message ===" -ForegroundColor Cyan
$requestBody2 = @{
    model = "backend"
    messages = @(
        @{
            role = "user"
            content = "こんにちは、これは日本語のテストです。"
        }
    )
    temperature = 0.7
    max_tokens = 2000
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody2 -ContentType "application/json"
    $responseData = $response.Content | ConvertFrom-Json
    
    Write-Host "Response Content: $($responseData.choices[0].message.content)" -ForegroundColor $(if ($responseData.choices[0].message.content) { "Green" } else { "Red" })
    Write-Host "Finish Reason: $($responseData.choices[0].finish_reason)" -ForegroundColor Yellow
    Write-Host "Total Tokens: $($responseData.usage.total_tokens)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "=== Tests Complete ===" -ForegroundColor Green





