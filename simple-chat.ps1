# Simple Chat Script - Continue Extension Alternative

Write-Host "=== Simple Chat Interface ===" -ForegroundColor Green
Write-Host "Continue extension alternative - Manual API calls" -ForegroundColor Yellow
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"
$conversationHistory = @()

while ($true) {
    Write-Host ""
    Write-Host "=== Chat ===" -ForegroundColor Cyan
    $userInput = Read-Host "You (type 'exit' to quit)"
    
    if ($userInput -eq "exit") {
        Write-Host "Exiting chat..." -ForegroundColor Yellow
        break
    }
    
    if ([string]::IsNullOrWhiteSpace($userInput)) {
        Write-Host "Please enter a message." -ForegroundColor Red
        continue
    }
    
    # Add to conversation history
    $conversationHistory += @{
        role = "user"
        content = $userInput
    }
    
    # Create request body
    $requestBody = @{
        model = "backend"
        messages = $conversationHistory
        temperature = 0.7
        max_tokens = 2000
    } | ConvertTo-Json -Depth 3
    
    Write-Host ""
    Write-Host "AI is thinking..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
        
        if ($response.StatusCode -eq 200) {
            $responseData = $response.Content | ConvertFrom-Json
            $aiResponse = $responseData.choices[0].message.content
            
            Write-Host ""
            Write-Host "AI: $aiResponse" -ForegroundColor White
            Write-Host ""
            
            # Add AI response to conversation history
            $conversationHistory += @{
                role = "assistant"
                content = $aiResponse
            }
            
            # Limit conversation history length
            if ($conversationHistory.Count -gt 20) {
                $conversationHistory = $conversationHistory[-20..-1]
            }
            
        } else {
            Write-Host "Error: HTTP $($response.StatusCode)" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Conversation History ===" -ForegroundColor Cyan
foreach ($message in $conversationHistory) {
    $role = if ($message.role -eq "user") { "You" } else { "AI" }
    $color = if ($message.role -eq "user") { "Green" } else { "White" }
    Write-Host "$role : $($message.content)" -ForegroundColor $color
}










