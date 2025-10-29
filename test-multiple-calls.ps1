# API呼び出しテスト - 複数回実行してログを確認

Write-Host "=== API呼び出しテスト（複数回実行）===" -ForegroundColor Green
Write-Host ""

$apiUrl = "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai"

for ($i = 1; $i -le 3; $i++) {
    Write-Host "=== テスト $i ===" -ForegroundColor Cyan
    
    $requestBody = @{
        model = "gpt-4o"
        messages = @(
            @{
                role = "user"
                content = "テストメッセージ $i - これは何回目のテストですか？"
            }
        )
        temperature = 0.7
        max_tokens = 100
    } | ConvertTo-Json -Depth 3
    
    Write-Host "リクエスト送信中..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $requestBody -ContentType "application/json"
        
        Write-Host "ステータス: $($response.StatusCode)" -ForegroundColor Green
        
        if ($response.StatusCode -eq 200) {
            $responseData = $response.Content | ConvertFrom-Json
            Write-Host "レスポンス: $($responseData.choices[0].message.content)" -ForegroundColor White
        } else {
            Write-Host "エラーレスポンス: $($response.Content)" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "エラー: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host "ステータス: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            Write-Host "レスポンス: $($_.Exception.Response.Content)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Start-Sleep -Seconds 2
}

Write-Host "=== テスト完了 ===" -ForegroundColor Green
Write-Host "Supabaseのログテーブルで各リクエストが記録されているか確認してください。" -ForegroundColor Yellow








