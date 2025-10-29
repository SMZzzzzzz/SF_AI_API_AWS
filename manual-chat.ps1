# Manual Chat Script - Continue拡張機能の代替

Write-Host "=== Manual Chat Interface ===" -ForegroundColor Green
Write-Host "Continue拡張機能の代替として手動でAPIを呼び出します" -ForegroundColor Yellow
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"
$conversationHistory = @()

while ($true) {
    Write-Host ""
    Write-Host "=== チャット ===" -ForegroundColor Cyan
    $userInput = Read-Host "あなた (終了するには 'exit' と入力)"
    
    if ($userInput -eq "exit") {
        Write-Host "チャットを終了します。" -ForegroundColor Yellow
        break
    }
    
    if ([string]::IsNullOrWhiteSpace($userInput)) {
        Write-Host "メッセージを入力してください。" -ForegroundColor Red
        continue
    }
    
    # 会話履歴に追加
    $conversationHistory += @{
        role = "user"
        content = $userInput
    }
    
    # リクエストボディを作成
    $requestBody = @{
        model = "backend"
        messages = $conversationHistory
        temperature = 0.7
        max_tokens = 2000
    } | ConvertTo-Json -Depth 3
    
    Write-Host ""
    Write-Host "AI が考えています..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
        
        if ($response.StatusCode -eq 200) {
            $responseData = $response.Content | ConvertFrom-Json
            $aiResponse = $responseData.choices[0].message.content
            
            Write-Host ""
            Write-Host "AI: $aiResponse" -ForegroundColor White
            Write-Host ""
            
            # AIの応答を会話履歴に追加
            $conversationHistory += @{
                role = "assistant"
                content = $aiResponse
            }
            
            # 会話履歴が長くなりすぎないように制限
            if ($conversationHistory.Count -gt 20) {
                $conversationHistory = $conversationHistory[-20..-1]
            }
            
        } else {
            Write-Host "エラー: HTTP $($response.StatusCode)" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "エラー: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== 会話履歴 ===" -ForegroundColor Cyan
foreach ($message in $conversationHistory) {
    $role = if ($message.role -eq "user") { "あなた" } else { "AI" }
    $color = if ($message.role -eq "user") { "Green" } else { "White" }
    Write-Host "$role : $($message.content)" -ForegroundColor $color
}

