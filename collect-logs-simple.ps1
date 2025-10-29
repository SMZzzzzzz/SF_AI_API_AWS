# Simple Extension Log Collection Script

Write-Host "=== Extension Log Collection Script ===" -ForegroundColor Green
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "extension-logs_$timestamp.txt"

Write-Host "Log file: $logFile" -ForegroundColor Yellow
Write-Host ""

# Create log collection instructions
$instructions = @"
=== Extension Log Collection Instructions ===
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

1. Open VS Code/Cursor
2. Open Developer Tools (F12)
3. Select Console tab
4. Follow these steps to collect logs:

=== Continue Extension ===
- Send a question in Continue panel
- Check error messages in Console
- Select all (Ctrl+A) and copy (Ctrl+C)
- Paste below the separator line

--- Continue Extension Logs ---


=== CodeGPT Extension ===
- Send a question in CodeGPT panel
- Check error messages in Console
- Select all (Ctrl+A) and copy (Ctrl+C)
- Paste below the separator line

--- CodeGPT Extension Logs ---


=== Cline Extension ===
- Send a question in Cline panel
- Check error messages in Console
- Select all (Ctrl+A) and copy (Ctrl+C)
- Paste below the separator line

--- Cline Extension Logs ---


=== Network Tab Information ===
- Filter by 'supabase' in Network tab
- Check if requests are displayed
- If displayed, copy request details
- Paste below the separator line

--- Network Tab Information ---


=== Other Error Information ===
- If there are other error messages
- Paste below the separator line

--- Other Errors ---

"@

# Save instructions to file
$instructions | Out-File -FilePath $logFile -Encoding UTF8

Write-Host "Log collection instruction file created" -ForegroundColor Green
Write-Host "File: $logFile" -ForegroundColor White
Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Follow the instructions above to collect logs" -ForegroundColor White
Write-Host "2. Copy and paste error messages from each extension" -ForegroundColor White
Write-Host "3. After completion, check the log file for analysis" -ForegroundColor White
Write-Host ""
Write-Host "Open log file? (y/n): " -ForegroundColor Yellow -NoNewline

$response = Read-Host
if ($response -eq "y" -or $response -eq "Y") {
    Start-Process notepad $logFile
}

Write-Host ""
Write-Host "=== Log Collection Complete ===" -ForegroundColor Green






