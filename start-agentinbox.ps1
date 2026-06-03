Set-Location "C:\Users\user\Desktop\Projects\AgentInbox"

# Start Claude in a new window
$proc = Start-Process -FilePath "C:\Users\user\.local\bin\claude.exe" `
    -ArgumentList "--dangerously-skip-permissions" `
    -WorkingDirectory "C:\Users\user\Desktop\Projects\AgentInbox" `
    -PassThru

# Wait for Claude to start
Start-Sleep -Seconds 5

# Send the loop prompt via SendKeys
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id)
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("start the autonomous task loop{ENTER}")
