# API Call Test - Multiple executions to check logs

Write-Host "=== API Call Test (Multiple Executions) ===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

for ($i = 1; $i -le 3; $i++) {
    Write-Host "=== Test $i ===" -ForegroundColor Cyan
    
    $requestBody = @{
        model = "gpt-4o"
        messages = @(
            @{
                role = "user"
                content = "Test message $i - What test number is this?"
            }
        )
        temperature = 0.7
        max_tokens = 100
    } | ConvertTo-Json -Depth 3
    
    Write-Host "Sending request..." -ForegroundColor Yellow
    
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
        if ($_.Exception.Response) {
            Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            Write-Host "Response: $($_.Exception.Response.Content)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Start-Sleep -Seconds 2
}

Write-Host "=== Test Complete ===" -ForegroundColor Green
Write-Host "Please check if each request is recorded in Supabase logs table." -ForegroundColor Yellow








