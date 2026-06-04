# AgentInbox — Current State (June 4, 2026)

## What AgentInbox Is

**AgentInbox is a pipe. Nothing more.**

Client submits a bug → AgentInbox queues it → Developer's Claude wakes, fixes it, posts proof back.

```
Client/QA/PM
  → submits via submission form (no account needed)
AgentInbox server (hosted on Render)
  → stores task, pushes task.created via WebSocket
agentinbox-mcp (running inside developer's VS Code)
  → receives push instantly — no polling
  → spawns: claude --dangerously-skip-permissions --print "check agent inbox..."
Claude (woken on demand)
  → drains ALL pending tasks, fixes them, exits
  → agentinbox-mcp goes back to listening
PM dashboard
  → sees task done with proof in real time
```

**Zero polling. Zero idle tokens. Claude only runs when there is real work.**

---

## Developer Experience

### One-time setup (two actions)
1. Download setup file from PM dashboard → paste prompt into Claude Code
2. Click "Allow automatic tasks" in VS Code once

### Daily flow (zero actions)
```
Open VS Code → Claude starts automatically → tasks handled → done
```

---

## Architecture

### Wake-on-task (no polling)
```
task.created WebSocket push
  → agentinbox-mcp.spawnClaude() — debounced
  → claude --dangerously-skip-permissions --print "check agent inbox and process all pending tasks"
  → Claude drains queue, exits
  → agentinbox-mcp listens for next task
```

### Token cost
- **Idle:** zero — agentinbox-mcp is a tiny Node process, Claude not running
- **Active:** only when processing real tasks, proportional to work done

### VS Code auto-start
`.vscode/tasks.json` with `runOn: folderOpen` — Claude starts when project opens, no terminal command needed.

---

## What's Built

### agentinbox-mcp (v0.1.2 — published on npm)
- `spawnClaude()` — wakes Claude on task.created, debounced (skips if already running)
- `CLAUDE_PATH` env var — path to claude binary (default: `claude`)
- `CLAUDE_PROJECT_PATH` env var — project folder (default: cwd)
- 9 MCP tools: get_pending_tasks, get_task, get_file, update_task_status, complete_task, escalate_task, propose_plan, ask_developer, notify_developer

### Setup endpoint (GET /api/setup/download)
- Returns a plain text prompt pre-filled with the developer's workspace token
- Developer pastes it into Claude Code — Claude configures everything
- No manual file editing, no npm install, no terminal commands

### Files Claude writes during setup
- `.mcp.json` — workspace token, `npx agentinbox-mcp`
- `.vscode/tasks.json` — `runOn: folderOpen`, `claude --dangerously-skip-permissions`
- `CLAUDE.local.md` — task processing rules tailored to their stack
- `CLAUDE.md` — rule index
- `.claude/rules/` — domain knowledge files
- `.gitignore` entries

### Core Infrastructure
- Express + Socket.io server (SQLite locally, Turso on Render)
- PM dashboard — task list, detail panel, approval controls
- Submission form — file upload, custom fields, constellation animation
- Auth — JWT login/signup, workspace management
- Approval gate — per-project, Claude proposes plan before touching code
- Telegram — bidirectional notifications, approve/reject via reply
- Playground — animation + chat live demos

---

## How to Run

**Production:** https://useagentinbox.com (Render, always on)

**Local dev:**
```powershell
cd packages/server && node dist/cli.js start
```

---

## Credentials

- Login: robin@agentinbox.com / Admin123!
- Workspace token: wt_viDerhoIo36j1rj8vtWu_aX8k0bOyfh2
- MBL project token: 898NSXnUt9stlGsOCtJM0jPaNSVGb7Mz
- Render: https://useagentinbox.com
- npm: agentinbox-mcp@0.1.2

---

## Not Built Yet (priority order)

1. Stripe billing — zero revenue without it (2 days)
2. Slack webhook — sticky feature, PMs love it (1 day)
3. SLA/stats dashboard — renewal justification (2 hours)
4. PDF weekly report — PM sends to client (1 day)
