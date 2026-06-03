@echo off
powershell -ExecutionPolicy Bypass -Command "while($true) { Set-Location 'C:\Users\user\Desktop\Projects\AgentInbox'; 'start the autonomous task loop' | & 'C:\Users\user\.local\bin\claude.exe' --dangerously-skip-permissions; Start-Sleep 60 }"
