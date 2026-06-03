@echo off
REM Start Claude resuming the last session (loop was already running)
REM -c continues the most recent conversation in this directory
start /min cmd /k "cd /d C:\Users\user\Desktop\Projects\AgentInbox && C:\Users\user\.local\bin\claude.exe -c"
echo AgentInbox worker started
