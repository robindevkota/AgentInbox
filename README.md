# AgentInbox

> Drop a bug or feature request — AI ships the fix, everyone sees what happened.

## Quick start

```bash
# Install dependencies
pnpm install

# Run in dev mode (server + UI with hot reload)
pnpm dev

# Or build and run production
pnpm build
node packages/server/dist/cli.js
```

Server starts at `http://localhost:3000`.

## Setup your first project

```bash
# 1. Create a workspace (once per agency)
curl -X POST http://localhost:3000/api/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agency"}'

# 2. Create a project under it (once per client)
curl -X POST http://localhost:3000/api/workspaces/<workspace_id>/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Client App", "description": "Company B e-commerce site"}'

# 3. Copy the token from the response
# Send this URL to your client:
# http://localhost:3000/submit/<token>
```

## Connect Claude

Add to your Claude MCP config (`~/.claude/claude_desktop_config.json` or Claude Code settings):

```json
{
  "mcpServers": {
    "agentinbox": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Claude now has access to all 6 tools: `get_pending_tasks`, `get_task`, `update_task_status`, `complete_task`, `get_file`, `escalate_task`.

## PM Dashboard

Open `http://localhost:3000/pm` — sign in with your workspace ID and API key (set `API_KEY` in `.env`).

## Environment variables

Copy `.env.example` to `.env`:

```
PORT=3000
DATA_DIR=./data
API_KEY=your-secret-key   # optional, secures PM dashboard
```

## Docker

```bash
docker compose up
```

## Project structure

```
packages/
  server/    # MCP server + REST API (TypeScript + Express + SQLite)
  ui/        # React UI (submit form, live status, PM dashboard)
```
