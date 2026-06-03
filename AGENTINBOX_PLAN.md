# AgentInbox — Current State (June 2, 2026)

## What AgentInbox Is

**AgentInbox is a pipe. Nothing more.**

Client submits a bug → AgentInbox queues it → Developer's Claude Code picks it up, fixes it, posts proof back. We own the pipe. We do NOT own the AI, the agent, the codebase, or the fix.

```
Client/QA/PM
  → submits via submission form (no account needed)
AgentInbox server (hosted on Render)
  → stores task, notifies developer's Claude via WebSocket
Developer's Claude Code (their machine, their codebase)
  → picks up task via agentinbox-mcp
  → fixes bug using their own CLAUDE.md rules
  → calls complete_task() with summary + screenshot
PM dashboard
  → sees task done with proof in real time
```

Pricing: per project (repo connected), not per seat or agent.

---

## What's Built

### Core Infrastructure
- Express + Socket.io server (SQLite locally, Turso on Render)
- PM dashboard — dark theme, sidebar toggle, task detail panel
- Submission form — dark theme, constellation animation, file upload
- Status page — live SSE polling, progress steps
- Auth — JWT login/signup, workspace management
- agentinbox-mcp npm package — 9 MCP tools for Claude Code

### MCP Tools (packages/mcp)
- get_pending_tasks() — fetch all pending tasks
- get_task(id) — full task detail
- get_file(id) — attached file content
- update_task_status(id, status) — mark in_progress/blocked/failed
- complete_task(id, technical, plain, screenshot?) — mark done with proof
- escalate_task(id, reason) — flag for human review
- propose_plan(id, plan) — propose before making changes
- ask_developer(id, question) — ask via Telegram, poll for reply
- notify_developer(id, message) — one-way Telegram ping

### Approval Gate
- Per-project toggle: "Require approval before Claude touches code"
- Claude proposes plan → stops → waits for approval
- Developer approves/rejects from PM dashboard OR Telegram
- Rejection sends reason → Claude revises → re-proposes

### Telegram Bidirectional
- Bot: @AgentInboxAlertBot (token: 8670075560:AAEr8qxNu3FguetI06xmvofBYpvBz7nRbhU)
- Chat ID: 6121077387
- Bug submitted → Telegram notification
- Fix done → Telegram notification
- Escalated → Telegram notification
- Approval needed → Telegram with plan, reply "approve" or "reject: reason"
- ask_developer() — Claude asks mid-task, waits 5 min for reply

### Playground (/playground)
- Two-tab live demo page
- Animation tab — user types prompt → Claude writes canvas JS → renders live
- Chat tab — fake store data → Claude answers customer questions
- Terminal shows live progress (SSE polling)
- Waitlist email capture
- Seeded projects: playground-animation-demo + playground-chat-demo

### UI Pages
- / — landing page with constellation animation
- /login + /signup — dark theme
- /pm — PM dashboard (requires auth)
- /submit/:token — client submission form (no auth needed)
- /task/:taskId — public status page
- /playground — live demo (animation + chat tabs)

---

## How to Run (Confirmed Working)

**Daily setup — one command, works all day:**
```powershell
while($true) { 'start the autonomous task loop' | & 'C:\Users\user\.local\bin\claude.exe' --dangerously-skip-permissions; Start-Sleep 60 }
```

Run this once in VS Code terminal. Claude checks for tasks every 60 seconds automatically.
Keep terminal open — close it to stop.

**What happens after:**
```
Bug submitted on useagentinbox.com
  → Telegram: 🐛 New bug notification
  → Claude picks up within 60 seconds (no input needed)
  → Claude fixes, completes
  → Telegram: ✅ Fixed
```

**Server:** Already on Render — always on, no local server needed.

**Production flow (Render deployed):**
```
Task submitted to Render server
  → WebSocket fires task.created to Claude Code
  → Claude picks it up instantly (no polling needed)
  → Claude processes, completes, goes back to waiting
```

**MCP config (start-mcp.js):**
- Token: wt_DP4-DtzO4y2sKm2j3u50-g5xLj9T_sFx (Render workspace token)
- URL: https://useagentinbox.com
- Registered in user scope (~/.claude.json)

**Auto-start (in progress):**
- `start-agentinbox.bat` — runs `claude -c` to resume last session
- Added to Windows startup folder
- `claude -c` resumes most recent conversation (loop was already running)
- Still being tested — may need alternative approach

**Current daily workflow:**
1. Open VS Code in AgentInbox folder
2. Type: `claude`
3. Type: `Read CLAUDE.local.md and start the loop`
4. Works all day automatically

**Customer setup (one time):**
1. Download setup file from useagentinbox.com
2. Run it — adds .mcp.json + CLAUDE.md to their project
3. Every day: open VS Code → type claude → type loop prompt once

---

## Credentials

- Local server: http://localhost:3001
- Login: robin@agentinbox.com / Admin123!
- Workspace token: wt_viDerhoIo36j1rj8vtWu_aX8k0bOyfh2
- MBL project token: 898NSXnUt9stlGsOCtJM0jPaNSVGb7Mz
- Playground animation: playground-animation-demo
- Playground chat: playground-chat-demo
- Render: https://useagentinbox.com
- Render env vars needed: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

---

## Not Built Yet (priority order)

1. Stripe billing — zero revenue without it (2 days)
2. Slack webhook — sticky feature, PMs love it (1 day)
3. Slack webhook — sticky feature, PMs love it (1 day)
4. SLA/stats dashboard — renewal justification (2 hours)
5. PDF weekly report — PM sends to client (1 day)

---

## Daily Workflow

1. Open VS Code in AgentInbox folder
2. cd packages/server && node dist/cli.js start
3. Done — Claude wakes up automatically when tasks arrive, no polling

---

## The Two Pitches

For developers/agencies:
"Your PM, QA, or client submits a bug. Your Claude picks it up, fixes it, posts a screenshot back. No WhatsApp chains, no interruptions, no lost context. 8 lines of config."

For solo devs/freelancers:
"You're already paying $20/mo for Claude Pro. AgentInbox routes your clients' bugs directly into it — no API key, no per-token cost. Your clients get a professional bug tracker. You get an AI that fixes bugs while you sleep."
