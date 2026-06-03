@echo off
cd /d "C:\Users\user\Desktop\Projects\AgentInbox\packages\server"
start /min "AgentInbox Server" "C:\nvm4w\nodejs\node.exe" dist/cli.js start
echo AgentInbox server started in background
