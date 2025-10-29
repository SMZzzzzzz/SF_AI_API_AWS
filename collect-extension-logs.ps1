# 拡張機能のログ収集スクリプト

param(
    [string]$OutputDir = "extension-logs",
    [int]$WaitSeconds = 10
)

Write-Host "=== 拡張機能ログ収集スクリプト ===" -ForegroundColor Green
Write-Host ""

# 出力ディレクトリを作成
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $OutputDir "extension-logs_$timestamp.txt"

Write-Host "ログファイル: $logFile" -ForegroundColor Yellow
Write-Host ""

# ログ収集の指示
$instructions = @"
=== 拡張機能ログ収集手順 ===
日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

1. VS Code/Cursorを開く
2. 開発者ツール (F12) を開く
3. Consoleタブを選択
4. 以下の手順でログを収集:

=== Continue拡張機能 ===
- Continueパネルで質問を送信
- Consoleでエラーメッセージを確認
- Ctrl+A で全選択 → Ctrl+C でコピー
- 下記の区切り線の後に貼り付け

--- Continue拡張機能ログ ---


=== CodeGPT拡張機能 ===
- CodeGPTパネルで質問を送信
- Consoleでエラーメッセージを確認
- Ctrl+A で全選択 → Ctrl+C でコピー
- 下記の区切り線の後に貼り付け

--- CodeGPT拡張機能ログ ---


=== Cline拡張機能 ===
- Clineパネルで質問を送信
- Consoleでエラーメッセージを確認
- Ctrl+A で全選択 → Ctrl+C でコピー
- 下記の区切り線の後に貼り付け

--- Cline拡張機能ログ ---


=== Networkタブのリクエスト情報 ===
- Networkタブで 'supabase' でフィルタリング
- リクエストが表示されるか確認
- 表示される場合は、リクエスト詳細をコピー
- 下記の区切り線の後に貼り付け

--- Networkタブ情報 ---


=== その他のエラー情報 ===
- その他に表示されるエラーメッセージがあれば
- 下記の区切り線の後に貼り付け

--- その他のエラー ---

"@

# 指示をファイルに保存
$instructions | Out-File -FilePath $logFile -Encoding UTF8

Write-Host "✅ ログ収集指示ファイルを作成しました" -ForegroundColor Green
Write-Host "ファイル: $logFile" -ForegroundColor White
Write-Host ""
Write-Host "=== 次の手順 ===" -ForegroundColor Cyan
Write-Host "1. 上記の指示に従ってログを収集" -ForegroundColor White
Write-Host "2. 各拡張機能のエラーメッセージをコピー&ペースト" -ForegroundColor White
Write-Host "3. 完了後、このスクリプトを再実行して結果を確認" -ForegroundColor White
Write-Host ""
Write-Host "ログファイルを開きますか? (y/n): " -ForegroundColor Yellow -NoNewline

$response = Read-Host
if ($response -eq "y" -or $response -eq "Y") {
    Start-Process notepad $logFile
}

Write-Host ""
Write-Host "=== ログ収集完了 ===" -ForegroundColor Green
