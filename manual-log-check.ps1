# Simple Log Check - Direct API Test

Write-Host "=== Simple Log Check ===" -ForegroundColor Green
Write-Host ""

Write-Host "Please check the following in Supabase Dashboard:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Go to: https://supabase.com/dashboard/project/ndiwsfzozeudtenshwgx/editor" -ForegroundColor Cyan
Write-Host "2. Navigate to: Table Editor > ai_api_logs" -ForegroundColor Cyan
Write-Host "3. Sort by 'ts' column (descending)" -ForegroundColor Cyan
Write-Host "4. Check the latest 3 records" -ForegroundColor Cyan
Write-Host ""

Write-Host "=== What to Compare ===" -ForegroundColor White
Write-Host ""
Write-Host "For each record, check:" -ForegroundColor Yellow
Write-Host "- prompt: Should contain your test messages" -ForegroundColor White
Write-Host "- response: Should contain the AI responses you saw in UI" -ForegroundColor White
Write-Host "- ts: Timestamp should match when you sent messages" -ForegroundColor White
Write-Host ""

Write-Host "=== Expected Test Messages ===" -ForegroundColor Cyan
Write-Host "Test 1: 'テスト１回目'" -ForegroundColor White
Write-Host "Test 2: 'テスト２回目'" -ForegroundColor White  
Write-Host "Test 3: 'テスト３回目'" -ForegroundColor White
Write-Host ""

Write-Host "=== Questions to Answer ===" -ForegroundColor Green
Write-Host "1. Are all 3 test messages recorded in the logs?" -ForegroundColor White
Write-Host "2. Do the responses in logs match what you saw in Cursor UI?" -ForegroundColor White
Write-Host "3. Are there any missing records or discrepancies?" -ForegroundColor White
Write-Host ""

Write-Host "Please check the Supabase dashboard and report your findings." -ForegroundColor Yellow








