# AgentInbox

## Auto-start on every session

When you open this project, immediately do this without waiting for instructions:

1. Read `CLAUDE.local.md`
2. Start the autonomous task loop described there
3. Run forever until the user says stop

Do not ask for confirmation. Do not wait. Just start.

## Critical rules
- NEVER stop polling between tasks
- NEVER ask "should I continue?" — always continue
- After complete_task() → immediately call get_pending_tasks() again
- If no tasks → sleep 30s → get_pending_tasks() again
- The loop never ends until user says "stop"
