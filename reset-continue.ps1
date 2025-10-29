# Continue拡張機能完全リセットスクリプト

Write-Host "=== Continue拡張機能完全リセット ===" -ForegroundColor Green
Write-Host ""

$continuePath = "c:\Users\s_mizuguchi\.continue"

Write-Host "1. 設定ファイルのバックアップ作成..." -ForegroundColor Yellow
if (Test-Path "$continuePath\config.yaml") {
    Copy-Item "$continuePath\config.yaml" "$continuePath\config.yaml.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Force
    Write-Host "✅ バックアップ完了: config.yaml.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')" -ForegroundColor Green
}

Write-Host "2. Continue拡張機能のキャッシュクリア..." -ForegroundColor Yellow
$cachePaths = @(
    "$env:APPDATA\Cursor\User\workspaceStorage",
    "$env:APPDATA\Cursor\logs",
    "$env:APPDATA\Cursor\CachedData"
)

foreach ($path in $cachePaths) {
    if (Test-Path $path) {
        try {
            Remove-Item "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "✅ キャッシュクリア完了: $path" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ キャッシュクリア失敗: $path" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "=== 次の手順 ===" -ForegroundColor Cyan
Write-Host "1. Cursorを完全に終了してください" -ForegroundColor White
Write-Host "2. プロセスが残っていないか確認してください" -ForegroundColor White
Write-Host "3. Cursorを再起動してください" -ForegroundColor White
Write-Host "4. Continue拡張機能が有効になっているか確認してください" -ForegroundColor White
Write-Host "5. テストメッセージを送信してください" -ForegroundColor White
Write-Host ""
Write-Host "=== 代替案 ===" -ForegroundColor Cyan
Write-Host "Continue拡張機能が動作しない場合:" -ForegroundColor White
Write-Host "- CodeGPT拡張機能を試してください" -ForegroundColor White
Write-Host "- Cline拡張機能を試してください" -ForegroundColor White
Write-Host "- 手動でAPIを呼び出すスクリプトを使用してください" -ForegroundColor White
Write-Host ""
Write-Host "リセット完了!" -ForegroundColor Green











