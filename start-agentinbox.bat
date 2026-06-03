@echo off
cd /d C:\Users\user\Desktop\Projects\AgentInbox

:loop
echo start the autonomous task loop | "C:\Users\user\.local\bin\claude.exe" --dangerously-skip-permissions
timeout /t 60 /nobreak >nul
goto loop
