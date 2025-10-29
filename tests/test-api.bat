@echo off
REM LLM Proxy API テストスクリプト (バッチ版)
REM コマンドラインからAPIを呼び出してレスポンスをファイル出力

setlocal enabledelayedexpansion

REM デフォルト値
if "%1"=="" set MODEL=backend
if "%2"=="" set MESSAGE=Hello! Please introduce yourself.
if "%3"=="" set OUTPUT_FILE=api_response_batch.txt

if not "%1"=="" set MODEL=%1
if not "%2"=="" set MESSAGE=%2
if not "%3"=="" set OUTPUT_FILE=%3

echo === LLM Proxy API テスト (バッチ版) ===
echo モデル: %MODEL%
echo メッセージ: %MESSAGE%
echo 出力ファイル: %OUTPUT_FILE%
echo.

REM APIエンドポイント
set API_URL=https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai

REM PowerShellでAPI呼び出し
echo APIリクエスト送信中...

powershell -Command "& {
    $body = @{
        model = '%MODEL%'
        messages = @(@{
            role = 'user'
            content = '%MESSAGE%'
        })
        temperature = 0.7
        max_tokens = 200
    } | ConvertTo-Json -Depth 3
    
    try {
        $response = Invoke-WebRequest -Uri '%API_URL%' -Method POST -Body $body -ContentType 'application/json'
        
        if ($response.StatusCode -eq 200) {
            Write-Host '✅ API呼び出し成功 (Status:' $response.StatusCode ')' -ForegroundColor Green
            
            $responseData = $response.Content | ConvertFrom-Json
            
            Write-Host ''
            Write-Host '=== レスポンス情報 ===' -ForegroundColor Cyan
            Write-Host '使用モデル:' $responseData.model -ForegroundColor White
            Write-Host 'トークン使用量:' $responseData.usage.total_tokens '(入力:' $responseData.usage.prompt_tokens ', 出力:' $responseData.usage.completion_tokens ')' -ForegroundColor White
            
            $responseContent = $responseData.choices[0].message.content
            
            Write-Host ''
            Write-Host '=== レスポンス内容 ===' -ForegroundColor Cyan
            Write-Host $responseContent -ForegroundColor White
            
            $outputContent = @'
=== LLM Proxy API レスポンス ===
日時: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '
モデル: ' + $responseData.model + '
プロンプト: %MESSAGE%
トークン使用量: ' + $responseData.usage.total_tokens + ' (入力: ' + $responseData.usage.prompt_tokens + ', 出力: ' + $responseData.usage.completion_tokens + ')

=== レスポンス内容 ===
' + $responseContent + '

=== 完全なJSONレスポンス ===
' + $response.Content + '
'@
            
            $outputContent | Out-File -FilePath '%OUTPUT_FILE%' -Encoding UTF8
            Write-Host ''
            Write-Host '✅ レスポンスをファイルに保存しました: %OUTPUT_FILE%' -ForegroundColor Green
            
        } else {
            Write-Host '❌ API呼び出し失敗 (Status:' $response.StatusCode ')' -ForegroundColor Red
            Write-Host 'エラー内容:' $response.Content -ForegroundColor Red
        }
        
    } catch {
        Write-Host '❌ エラーが発生しました:' -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}"

echo.
echo === テスト完了 ===
pause
