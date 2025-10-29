# Supabase Log Table Check - Compare with UI Display

Write-Host "=== Supabase Log Table Check ===" -ForegroundColor Green
Write-Host ""

# Supabase API endpoint for direct database query
$supabaseUrl = "https://ndiwsfzozeudtenshwgx.supabase.co"
$supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaXdzZnpvemV1ZHRlbnNod2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE5NzQ4MDAsImV4cCI6MjA0NzU1MDgwMH0.YourAnonKey"

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json"
}

# Query to get latest 3 records from ai_api_logs
$query = @{
    select = "ts, user_id, provider, model, prompt, response, tokens_in, tokens_out"
    order = "ts.desc"
    limit = 3
} | ConvertTo-Json

try {
    Write-Host "Fetching latest 3 records from ai_api_logs..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/ai_api_logs" -Method GET -Headers $headers -Body $query
    
    Write-Host ""
    Write-Host "=== Latest 3 Records ===" -ForegroundColor Cyan
    
    for ($i = 0; $i -lt $response.Count; $i++) {
        $record = $response[$i]
        $recordNumber = $i + 1
        
        Write-Host ""
        Write-Host "--- Record $recordNumber ---" -ForegroundColor White
        Write-Host "Timestamp: $($record.ts)" -ForegroundColor Gray
        Write-Host "User ID: $($record.user_id)" -ForegroundColor Gray
        Write-Host "Provider: $($record.provider)" -ForegroundColor Gray
        Write-Host "Model: $($record.model)" -ForegroundColor Gray
        Write-Host "Tokens In: $($record.tokens_in)" -ForegroundColor Gray
        Write-Host "Tokens Out: $($record.tokens_out)" -ForegroundColor Gray
        
        Write-Host ""
        Write-Host "PROMPT:" -ForegroundColor Yellow
        Write-Host "$($record.prompt)" -ForegroundColor White
        
        Write-Host ""
        Write-Host "RESPONSE:" -ForegroundColor Yellow
        if ($record.response) {
            # Extract content from response JSON
            $responseContent = $record.response.choices[0].message.content
            Write-Host "$responseContent" -ForegroundColor Green
        } else {
            Write-Host "No response data" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "=" * 50 -ForegroundColor DarkGray
    }
    
} catch {
    Write-Host "Error fetching logs: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Comparison Instructions ===" -ForegroundColor Cyan
Write-Host "Please compare the above log records with what you saw in the UI:" -ForegroundColor White
Write-Host "1. Check if the prompts match your test messages" -ForegroundColor White
Write-Host "2. Check if the responses match what you saw in Cursor UI" -ForegroundColor White
Write-Host "3. Note any differences or discrepancies" -ForegroundColor White








