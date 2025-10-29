# 既存ファイルの文字化け修正スクリプト
# Shift_JISで保存されたファイルをUTF-8に変換

param(
    [string]$InputFile = "api_response.txt",
    [string]$OutputFile = "api_response_utf8.txt"
)

Write-Host "=== 文字化け修正スクリプト ===" -ForegroundColor Green
Write-Host "入力ファイル: $InputFile" -ForegroundColor Yellow
Write-Host "出力ファイル: $OutputFile" -ForegroundColor Yellow
Write-Host ""

if (Test-Path $InputFile) {
    try {
        # Shift_JISで読み込み
        $content = Get-Content -Path $InputFile -Encoding Default
        
        # UTF-8で保存
        [System.IO.File]::WriteAllText($OutputFile, ($content -join "`n"), [System.Text.Encoding]::UTF8)
        
        Write-Host "✅ ファイルをUTF-8に変換しました: $OutputFile" -ForegroundColor Green
        
        # 変換結果を表示
        Write-Host ""
        Write-Host "=== 変換結果 ===" -ForegroundColor Cyan
        Get-Content -Path $OutputFile -Encoding UTF8 | Select-Object -First 10
        
    } catch {
        Write-Host "❌ エラーが発生しました: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "❌ 入力ファイルが見つかりません: $InputFile" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== 修正完了 ===" -ForegroundColor Green
