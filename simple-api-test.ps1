# Simple API Test Script

Write-Host "=== Simple API Test ===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

# Test 1: Basic Backend Request
Write-Host "=== Test 1: Backend Request ===" -ForegroundColor Cyan

$requestBody = @{
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

Write-Host "Request Body:" -ForegroundColor White
Write-Host $requestBody -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
    Write-Host "Success! Status Code: $($response.StatusCode)" -ForegroundColor Green
    
    $responseData = $response.Content | ConvertFrom-Json
    Write-Host ""
    Write-Host "Response Model: $($responseData.model)" -ForegroundColor White
    Write-Host "Response Content: $($responseData.choices[0].message.content)" -ForegroundColor White
    Write-Host ""
    Write-Host "Full Response Structure:" -ForegroundColor Yellow
    $responseData | ConvertTo-Json -Depth 3 | Write-Host
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Green




