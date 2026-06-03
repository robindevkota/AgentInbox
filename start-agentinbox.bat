@echo off
REM Start Claude Code in AgentInbox — auto-starts task loop from CLAUDE.md
REM Minimized window, runs in background
start /min cmd /k "cd /d C:\Users\user\Desktop\Projects\AgentInbox && C:\Users\user\.local\bin\claude.exe -c --dangerously-skip-permissions"
