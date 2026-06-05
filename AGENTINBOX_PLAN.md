# AgentInbox — Current State (June 5, 2026)

## What AgentInbox Is

**AgentInbox is a pipe. Nothing more.**

Client submits a bug → AgentInbox queues it → Developer's Claude wakes, fixes it, posts proof back.

```
Client/QA/PM
  → submits via submission form (no account needed)
AgentInbox server (hosted on Render)
  → stores task, pushes task.created via WebSocket
agentinbox-worker.js (running silently on developer's PC — no VS Code needed)
  → receives push instantly — no polling
  → spawns: claude --dangerously-skip-permissions --print "check agent inbox..."
Claude (woken on demand)
  → drains ALL pending tasks, fixes them, exits
  → worker resets, goes back to listening
PM dashboard
  → sees task done with proof in real time
Telegram
  → 🐛 on submit, ✅ on complete
```

**Zero polling. Zero idle tokens. VS Code does not need to be open.**

---

## Developer Experience

### One-time setup (two actions)
1. Download setup file from PM dashboard → paste prompt into Claude Code
2. Claude writes worker + startup script automatically

### Daily flow (zero actions)
```
PC turns on → worker starts silently → tasks handled → Telegram ✅
```

Developer doesn't need to open VS Code, open a terminal, or type anything.

---

## Architecture

### Wake-on-task (no polling)
```
task.created WebSocket push
  → agentinbox-worker.js receives it (always-on background process)
  → spawnClaude() — in-memory debounce (skips if already running)
  → claude --dangerously-skip-permissions --print "check pending tasks..."
  → Claude drains queue, exits
  → worker resets, listens for next task
```

### Why a standalone worker (not .mcp.json)
The MCP approach ties the WebSocket listener to an interactive Claude session.
When the developer is chatting with Claude, `spawnClaude()` is blocked.
The standalone worker runs independently — no conflict with interactive sessions.

### Token cost
- **Idle:** zero — worker is a tiny Node process (~5MB RAM), Claude not running
- **Active:** only when processing real tasks, proportional to work done

### Windows auto-start
`start-worker.vbs` in the Windows Startup folder — runs silently on PC boot, no window.

---

## What's Built

### agentinbox-worker.js (per-project, written during setup)
- Persistent WebSocket connection to AgentInbox server
- `spawnClaude()` with in-memory debounce
- Spawns `claude --dangerously-skip-permissions --print "<task prompt>"`
- Logs to `worker.log` in project root
- `start-worker.vbs` adds it to Windows startup silently

### agentinbox-mcp (v0.1.5 — published on npm)
- Still used for MCP tools inside Claude sessions (get_pending_tasks, complete_task, etc.)
- WebSocket wake logic also present but secondary to standalone worker
- 9 MCP tools: get_pending_tasks, get_task, get_file, update_task_status, complete_task, escalate_task, propose_plan, ask_developer, notify_developer

### Setup endpoint (GET /api/setup/download)
- Returns a plain text prompt pre-filled with the developer's workspace token
- Developer pastes it into Claude Code — Claude configures everything
- No manual file editing, no npm install, no terminal commands

### Core Infrastructure
- Express + Socket.io server (SQLite locally, Turso on Render)
- PM dashboard — task list, detail panel, approval controls
- Submission form — file upload, custom fields, constellation animation
- Auth — JWT login/signup, workspace management
- Approval gate — per-project, Claude proposes plan before touching code
- Telegram per-workspace — each developer connects their own bot via PM dashboard UI
- Two Telegram task sources: website form + direct bot message
- Bidirectional Telegram: approve/reject/answer questions via reply
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

- Login: robin.devkota@amniltech.com / Super@123
- Workspace token (Render): wt_cAyY3qI_a3TsfKAO8Z4idI9Nl7muGxva
- MBL project submission token (Render): RqUi3neoyyq-94nCD-heC8Yv6acZX00w
- MBL worker script: d:\mbl-account-opening\agentinbox-worker.js
- npm: agentinbox-mcp@0.1.5

---

## Telegram — Full Detail

### Two task sources
```
Source 1: Website submission form
  → task created → Telegram: "🐛 New bug" → Claude wakes

Source 2: You message the Telegram bot (non-reply message)
  → task created from your message → Telegram: "⚡ Task created" → Claude wakes
```

Only messages from the configured chat ID are accepted — no one else can trigger tasks.

### Bidirectional control (reply to a bot message)
- Approval needed → Claude sends plan → you reply "approve" or "reject: reason"
- Claude asks a question → you reply → Claude reads developer_reply and continues

### Configure via PM dashboard
PM dashboard → Settings → Telegram → enter bot token, chat ID, project

---

## Not Built Yet (priority order)

1. Stripe billing — zero revenue without it (2 days)
2. Setup prompt auto-generates worker + VBS for the developer's project
3. Slack webhook — sticky feature, PMs love it (1 day)
4. SLA/stats dashboard — renewal justification (2 hours)
5. PDF weekly report — PM sends to client (1 day)
