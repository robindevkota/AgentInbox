# AgentInbox

## On every session start
Read AGENTINBOX_PLAN.md for full context on what's built and what's next.

## Key docs
| Doc | Purpose |
|---|---|
| AGENTINBOX_PLAN.md | Architecture, credentials, what's built, what's next |
| SETUP.md | Developer setup guide (what users follow) |
| BACKLOG.md | Prioritised feature backlog |
| packages/mcp/src/index.ts | agentinbox-mcp source — wake-on-task logic lives here |
| packages/server/src/api/routes.ts | All API routes including /setup/download |

## Architecture in one line
Task submitted → WebSocket push → agentinbox-mcp spawns Claude → Claude fixes → exits. No polling.

## Rules
- Never add polling loops — wake-on-task via spawnClaude() is the pattern
- Never hardcode paths — claude is in PATH, project path comes from CLAUDE_PROJECT_PATH env
- agentinbox-mcp is published on npm — rebuild + publish after any change to packages/mcp/src/
- Server is on Render — rebuild dist before deploying (tsc in packages/server)
