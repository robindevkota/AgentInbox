$projectPath = "C:\Users\user\Desktop\Projects\AgentInbox"
$claudeExe = "C:\Users\user\.local\bin\claude.exe"
$prompt = "Read CLAUDE.local.md and process all pending AgentInbox tasks. When queue is empty, stop."

$claudeProcess = Get-Process -Name "claude" -ErrorAction SilentlyContinue
if ($claudeProcess) {
    Write-Host "[trigger] Claude already running"
    exit 0
}

Write-Host "[trigger] Waking Claude..."
& $claudeExe --print $prompt
Write-Host "[trigger] Claude finished"
