# Quick Log Collection Script

Write-Host "=== Quick Log Collection ===" -ForegroundColor Green
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "quick-logs_$timestamp.txt"

Write-Host "Creating log file: $logFile" -ForegroundColor Yellow

# Create a simple log collection template
$template = @"
=== Extension Debug Logs ===
Collected: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

INSTRUCTIONS:
1. Open VS Code/Cursor
2. Open Developer Tools (F12)
3. Test each extension and copy error messages
4. Paste the logs below the appropriate section

=== CONTINUE EXTENSION ===
1. Send question: "Hello"
2. Check Console for errors
3. Copy and paste below:

--- CONTINUE LOGS ---
[PASTE CONTINUE CONSOLE LOGS HERE]


=== CODEGPT EXTENSION ===
1. Send question: "Hello"
2. Check Console for errors
3. Copy and paste below:

--- CODEGPT LOGS ---
[PASTE CODEGPT CONSOLE LOGS HERE]


=== CLINE EXTENSION ===
1. Send question: "Hello"
2. Check Console for errors
3. Copy and paste below:

--- CLINE LOGS ---
[PASTE CLINE CONSOLE LOGS HERE]


=== NETWORK REQUESTS ===
1. Filter Network tab by "supabase"
2. Send question in any extension
3. Copy request details below:

--- NETWORK INFO ---
[PASTE NETWORK REQUEST DETAILS HERE]


=== ANALYSIS QUESTIONS ===
Please answer these questions after testing:

1. Does Continue send requests to supabase?
   Answer: [YES/NO]

2. Does CodeGPT send requests to supabase?
   Answer: [YES/NO]

3. Does Cline send requests to supabase?
   Answer: [YES/NO]

4. What error messages do you see in Console?
   Answer: [DESCRIBE ERRORS]

5. Do you see any network requests to supabase?
   Answer: [YES/NO - DESCRIBE]

"@

$template | Out-File -FilePath $logFile -Encoding UTF8

Write-Host "Log template created: $logFile" -ForegroundColor Green
Write-Host ""
Write-Host "=== NEXT STEPS ===" -ForegroundColor Cyan
Write-Host "1. Open the log file" -ForegroundColor White
Write-Host "2. Follow the instructions" -ForegroundColor White
Write-Host "3. Test each extension" -ForegroundColor White
Write-Host "4. Copy error messages to the file" -ForegroundColor White
Write-Host "5. Answer the analysis questions" -ForegroundColor White
Write-Host ""

# Open the file
Write-Host "Opening log file..." -ForegroundColor Yellow
Start-Process notepad $logFile

Write-Host "File opened in Notepad. Please follow the instructions!" -ForegroundColor Green






