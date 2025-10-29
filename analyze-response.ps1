# API Response Analysis Script

Write-Host "=== API Response Analysis ===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

# Test Request
$requestBody = @{
    model = "backend"
    messages = @(
        @{
            role = "user"
            content = "Test message for response analysis"
        }
    )
    temperature = 0.7
    max_tokens = 100
} | ConvertTo-Json -Depth 3

Write-Host "=== Request Details ===" -ForegroundColor Cyan
Write-Host "URL: $apiUrl" -ForegroundColor White
Write-Host "Method: POST" -ForegroundColor White
Write-Host "Content-Type: application/json" -ForegroundColor White
Write-Host "Request Body:" -ForegroundColor White
Write-Host $requestBody -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
    
    Write-Host "=== Response Details ===" -ForegroundColor Cyan
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor White
    Write-Host "Content-Type: $($response.Headers.'Content-Type')" -ForegroundColor White
    Write-Host "Content-Length: $($response.Headers.'Content-Length')" -ForegroundColor White
    Write-Host ""
    
    $responseData = $response.Content | ConvertFrom-Json
    
    Write-Host "=== Response Structure Analysis ===" -ForegroundColor Cyan
    Write-Host "Required OpenAI Fields:" -ForegroundColor Yellow
    Write-Host "  - id: $($responseData.id)" -ForegroundColor White
    Write-Host "  - object: $($responseData.object)" -ForegroundColor White
    Write-Host "  - created: $($responseData.created)" -ForegroundColor White
    Write-Host "  - model: $($responseData.model)" -ForegroundColor White
    Write-Host "  - choices: $($responseData.choices.Count) items" -ForegroundColor White
    Write-Host "  - usage: Present" -ForegroundColor White
    Write-Host ""
    
    Write-Host "=== Choices Analysis ===" -ForegroundColor Cyan
    if ($responseData.choices -and $responseData.choices.Count -gt 0) {
        $choice = $responseData.choices[0]
        Write-Host "Choice 0:" -ForegroundColor Yellow
        Write-Host "  - index: $($choice.index)" -ForegroundColor White
        Write-Host "  - message.role: $($choice.message.role)" -ForegroundColor White
        Write-Host "  - message.content: $($choice.message.content)" -ForegroundColor White
        Write-Host "  - finish_reason: $($choice.finish_reason)" -ForegroundColor White
        
        # Check for extra fields that might cause issues
        $extraFields = @()
        if ($choice.message.refusal) { $extraFields += "refusal" }
        if ($choice.message.annotations) { $extraFields += "annotations" }
        if ($choice.logprobs) { $extraFields += "logprobs" }
        
        if ($extraFields.Count -gt 0) {
            Write-Host "  - EXTRA FIELDS (might cause issues): $($extraFields -join ', ')" -ForegroundColor Red
        }
    }
    Write-Host ""
    
    Write-Host "=== Usage Analysis ===" -ForegroundColor Cyan
    if ($responseData.usage) {
        Write-Host "Usage Fields:" -ForegroundColor Yellow
        Write-Host "  - prompt_tokens: $($responseData.usage.prompt_tokens)" -ForegroundColor White
        Write-Host "  - completion_tokens: $($responseData.usage.completion_tokens)" -ForegroundColor White
        Write-Host "  - total_tokens: $($responseData.usage.total_tokens)" -ForegroundColor White
        
        # Check for extra usage fields
        $usageExtraFields = @()
        if ($responseData.usage.prompt_tokens_details) { $usageExtraFields += "prompt_tokens_details" }
        if ($responseData.usage.completion_tokens_details) { $usageExtraFields += "completion_tokens_details" }
        
        if ($usageExtraFields.Count -gt 0) {
            Write-Host "  - EXTRA USAGE FIELDS (might cause issues): $($usageExtraFields -join ', ')" -ForegroundColor Red
        }
    }
    Write-Host ""
    
    Write-Host "=== Extra Response Fields ===" -ForegroundColor Cyan
    $allFields = $responseData | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
    $openAIFields = @("id", "object", "created", "model", "choices", "usage")
    $extraResponseFields = $allFields | Where-Object { $_ -notin $openAIFields }
    
    if ($extraResponseFields.Count -gt 0) {
        Write-Host "EXTRA RESPONSE FIELDS (might cause issues): $($extraResponseFields -join ', ')" -ForegroundColor Red
        foreach ($field in $extraResponseFields) {
            Write-Host "  - $field : $($responseData.$field)" -ForegroundColor White
        }
    } else {
        Write-Host "No extra response fields found" -ForegroundColor Green
    }
    Write-Host ""
    
    Write-Host "=== OpenAI Compatibility Check ===" -ForegroundColor Cyan
    $compatibilityIssues = @()
    
    # Check required fields
    if (-not $responseData.id) { $compatibilityIssues += "Missing 'id' field" }
    if (-not $responseData.object) { $compatibilityIssues += "Missing 'object' field" }
    if (-not $responseData.created) { $compatibilityIssues += "Missing 'created' field" }
    if (-not $responseData.model) { $compatibilityIssues += "Missing 'model' field" }
    if (-not $responseData.choices) { $compatibilityIssues += "Missing 'choices' field" }
    if (-not $responseData.usage) { $compatibilityIssues += "Missing 'usage' field" }
    
    # Check choices structure
    if ($responseData.choices -and $responseData.choices.Count -gt 0) {
        $choice = $responseData.choices[0]
        if (-not $choice.index) { $compatibilityIssues += "Missing 'choices[0].index' field" }
        if (-not $choice.message) { $compatibilityIssues += "Missing 'choices[0].message' field" }
        if (-not $choice.finish_reason) { $compatibilityIssues += "Missing 'choices[0].finish_reason' field" }
        
        if ($choice.message) {
            if (-not $choice.message.role) { $compatibilityIssues += "Missing 'choices[0].message.role' field" }
            if (-not $choice.message.content) { $compatibilityIssues += "Missing 'choices[0].message.content' field" }
        }
    }
    
    if ($compatibilityIssues.Count -eq 0) {
        Write-Host "✅ OpenAI Compatibility: PASSED" -ForegroundColor Green
    } else {
        Write-Host "❌ OpenAI Compatibility: FAILED" -ForegroundColor Red
        foreach ($issue in $compatibilityIssues) {
            Write-Host "  - $issue" -ForegroundColor White
        }
    }
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Analysis Complete ===" -ForegroundColor Green







