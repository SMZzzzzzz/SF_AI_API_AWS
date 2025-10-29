# Debug Response Structure

Write-Host "=== Debug Response Structure ===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

$requestBody = @{
    model = "backend"
    messages = @(
        @{
            role = "user"
            content = "Debug test"
        }
    )
    temperature = 0.7
    max_tokens = 50
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
    $responseData = $response.Content | ConvertFrom-Json
    
    Write-Host "=== Raw Response JSON ===" -ForegroundColor Cyan
    $responseData | ConvertTo-Json -Depth 5 | Write-Host
    Write-Host ""
    
    Write-Host "=== Choices Structure ===" -ForegroundColor Cyan
    Write-Host "Choices count: $($responseData.choices.Count)" -ForegroundColor White
    if ($responseData.choices.Count -gt 0) {
        $choice = $responseData.choices[0]
        Write-Host "Choice 0 properties:" -ForegroundColor Yellow
        $choice | Get-Member -MemberType NoteProperty | ForEach-Object {
            Write-Host "  - $($_.Name): $($choice.($_.Name))" -ForegroundColor White
        }
    }
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}







