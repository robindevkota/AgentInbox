# trigger-claude.ps1
# Called by AgentInbox server when a new task arrives
# Opens Claude Code (if not already running the loop) and sends the task loop prompt
# Claude processes all pending tasks then exits automatically

$projectPath = "C:\Users\user\Desktop\Projects\AgentInbox"
$prompt = "Read CLAUDE.local.md and process all pending AgentInbox tasks. When queue is empty, exit — do not keep polling."

# Check if Claude Code is already running a session in this project
$claudeProcess = Get-Process -Name "claude" -ErrorAction SilentlyContinue

if ($claudeProcess) {
    # Claude is already running — it will pick up the task via WebSocket automatically
    Write-Host "[trigger] Claude already running — task will be picked up automatically"
    exit 0
}

# Claude not running — start it with the prompt
Write-Host "[trigger] Starting Claude Code for task processing..."
Start-Process -FilePath "claude" -ArgumentList "--print `"$prompt`"" -WorkingDirectory $projectPath -NoNewWindow -Wait
Write-Host "[trigger] Claude finished processing tasks"
