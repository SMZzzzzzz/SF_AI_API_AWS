# Japanese Message Test - Check where translation happens

Write-Host "=== Japanese Message Test ===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

# Test with Japanese message
$requestBody = @{
    model = "gpt-4o"
    messages = @(
        @{
            role = "user"
            content = "こんにちは、これは日本語のテストメッセージです。"
        }
    )
    temperature = 0.7
    max_tokens = 100
} | ConvertTo-Json -Depth 3

Write-Host "Sending Japanese message..." -ForegroundColor Yellow
Write-Host "Original message: こんにちは、これは日本語のテストメッセージです。" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
    
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    
    if ($response.StatusCode -eq 200) {
        $responseData = $response.Content | ConvertFrom-Json
        Write-Host "Response: $($responseData.choices[0].message.content)" -ForegroundColor White
    } else {
        Write-Host "Error Response: $($response.Content)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Check Supabase logs to see if the Japanese message was preserved." -ForegroundColor Yellow








