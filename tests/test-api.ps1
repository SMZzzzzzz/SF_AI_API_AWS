# LLM Proxy API テストスクリプト
# コマンドラインからAPIを呼び出してレスポンスをファイル出力

param(
    [string]$Model = "backend",
    [string]$Message = "Hello! Please introduce yourself.",
    [string]$OutputFile = "api_response.txt",
    [int]$MaxTokens = 200
)

Write-Host "=== LLM Proxy API テスト ===" -ForegroundColor Green
Write-Host "モデル: $Model" -ForegroundColor Yellow
Write-Host "メッセージ: $Message" -ForegroundColor Yellow
Write-Host "出力ファイル: $OutputFile" -ForegroundColor Yellow
Write-Host ""

# APIエンドポイント
$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

# リクエストボディ
$requestBody = @{
    model = $Model
    messages = @(
        @{
            role = "user"
            content = $Message
        }
    )
    temperature = 0.7
    max_tokens = $MaxTokens
} | ConvertTo-Json -Depth 3

Write-Host "APIリクエスト送信中..." -ForegroundColor Cyan

try {
    # API呼び出し
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ API呼び出し成功 (Status: $($response.StatusCode))" -ForegroundColor Green
        
        # レスポンスをパース
        $responseData = $response.Content | ConvertFrom-Json
        
        # レスポンス情報を表示
        Write-Host ""
        Write-Host "=== レスポンス情報 ===" -ForegroundColor Cyan
        Write-Host "使用モデル: $($responseData.model)" -ForegroundColor White
        Write-Host "トークン使用量: $($responseData.usage.total_tokens) (入力: $($responseData.usage.prompt_tokens), 出力: $($responseData.usage.completion_tokens))" -ForegroundColor White
        Write-Host "完了理由: $($responseData.choices[0].finish_reason)" -ForegroundColor White
        
        # レスポンス内容を取得
        $responseContent = $responseData.choices[0].message.content
        
        Write-Host ""
        Write-Host "=== レスポンス内容 ===" -ForegroundColor Cyan
        Write-Host $responseContent -ForegroundColor White
        
        # ファイルに出力
        $outputContent = @"
=== LLM Proxy API レスポンス ===
日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
モデル: $($responseData.model)
プロンプト: $Message
トークン使用量: $($responseData.usage.total_tokens) (入力: $($responseData.usage.prompt_tokens), 出力: $($responseData.usage.completion_tokens))

=== レスポンス内容 ===
$responseContent

=== 完全なJSONレスポンス ===
$($response.Content)
"@
        
        $outputContent | Out-File -FilePath $OutputFile -Encoding UTF8
        Write-Host ""
        Write-Host "✅ レスポンスをファイルに保存しました: $OutputFile" -ForegroundColor Green
        
    } else {
        Write-Host "❌ API呼び出し失敗 (Status: $($response.StatusCode))" -ForegroundColor Red
        Write-Host "エラー内容: $($response.Content)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ エラーが発生しました:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    # エラー情報もファイルに保存
    $errorContent = @"
=== LLM Proxy API エラー ===
日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
エラー: $($_.Exception.Message)
リクエスト: $requestBody
"@
    $errorContent | Out-File -FilePath "api_error.txt" -Encoding UTF8
    Write-Host "エラー情報を api_error.txt に保存しました" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== テスト完了 ===" -ForegroundColor Green
