# AgentInbox — Current State (June 10, 2026)

## What AgentInbox Is

**AgentInbox is a pipe. Nothing more.**

Client submits a bug → AgentInbox queues it → Developer's Claude wakes, fixes it, posts proof back.

```
Client/QA/PM
  → submits via submission form (no account needed)  OR  messages Telegram bot
AgentInbox server (hosted on Render)
  → stores task, pushes task.created via WebSocket
agentinbox-worker.js (running silently on developer's PC — no VS Code needed)
  → receives push instantly — no polling
  → spawns: claude --dangerously-skip-permissions --print "check agent inbox..."
Claude (woken on demand)
  → reads .mcp.json, connects to AgentInbox MCP tools
  → drains ALL pending tasks, fixes them
  → calls complete_task, exits
Worker (after Claude exits)
  → if task had require_verification=true → starts app, takes Playwright screenshot, sends photo to Telegram
  → resets, goes back to listening
PM dashboard
  → sees task done with proof + screenshot in real time
Telegram
  → ⚡ on submit, ✅ on complete
```

**Zero polling. Zero idle tokens. VS Code does not need to be open.**

---

## Developer Experience

### One-time setup (one paste)
1. Download setup file from PM dashboard → Settings → ↓ Download setup file
2. Paste prompt into Claude Code in your project root
3. Claude writes all files + adds startup script to OS — you never touch it again

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
  → checks .agentinbox-running lockfile — skips if Claude already running
  → writes lockfile, spawns Claude headlessly
  → claude --dangerously-skip-permissions --print "check pending tasks..."
  → Claude drains queue, exits
  → lockfile deleted, worker resets, listens for next task
```

### Why a standalone worker (not .mcp.json)
The MCP approach ties the WebSocket listener to an interactive Claude session.
When the developer is chatting with Claude, task processing would block.
The standalone worker runs in a completely separate process — no conflict ever.

### In-memory claudeRunning flag (worker)
The worker uses an in-memory `claudeRunning` boolean — set true on Claude spawn, reset false on exit.
Prevents two Claude instances within the same worker process.
No lockfile needed — the worker is a single long-running process per project.
The MCP package (`agentinbox-mcp`) still uses a lockfile with a 15-minute stale guard for the interactive Claude session path.

### Race prevention (atomic claim)
`update_task_status(in_progress)` uses `WHERE status = 'pending'` — only one Claude wins if two race.
The server returns HTTP 409 to the loser; Claude should skip the task and move to the next.

### Stuck task recovery
`get_pending_tasks` also returns tasks stuck in `in_progress` for over 15 minutes (Claude crashed mid-task).
Those tasks are reset to `pending` automatically before being returned, so they get retried.

### Socket deduplication
The server tracks only the **latest** agent socket per workspace in memory.
`emitTaskCreated` sends to that one socket only — not the whole room.
Prevents N VS Code sessions × M tasks = N×M Claude spawns.

### Poll loop cap
`ask_developer` and `propose_plan` poll loops are capped at 5 minutes in the TASK_PROMPT.
After 5 minutes with no reply, Claude proceeds with best judgment and notes it in summary_technical.

### Token cost
- **Idle:** zero — worker is a tiny Node process (~5MB RAM), Claude not running
- **Active:** only when processing real tasks, proportional to work done

### Auto-start
- **Windows:** `agentinbox-start.vbs` in Windows Startup folder — runs `agentinbox-start.bat` silently on PC boot
- **Mac:** launchd plist at `~/Library/LaunchAgents/com.agentinbox.worker.plist`

---

## What's Built

### agentinbox-worker.js (per-project, written during setup)
- Persistent WebSocket connection to AgentInbox server (path: `/agent-socket`)
- In-memory `claudeRunning` flag — prevents two Claude spawns in the same process
- Spawns `claude --dangerously-skip-permissions --print "<task prompt>" --max-budget-usd 0.50`
- Logs to `agentinbox.log` in project root
- Token + project path passed via env vars in startup bat/sh — not hardcoded
- On connect: fetches Telegram bot token + chat ID from `/api/agent/workspace` — no manual Telegram config in env vars
- After Claude exits: if `require_verification=true` on the task, runs `npx playwright screenshot` to capture proof, sends photo to Telegram via Bot API
- Screenshot flow: kills port → starts app (reads `## Verification` section from `CLAUDE.local.md`) → polls URL up to 20s → auto-detects HTML file (prefers `index.html`, falls back to any `.html` in root) → takes screenshot → **kills serve process tree with `taskkill /F /T /PID`** → sends to Telegram
- Serve process kill: uses `taskkill /F /T` (full process tree) — `SIGTERM` on Windows does not cascade to child processes, leaving zombie serve windows on port 3000

### .mcp.json (per-project, written during setup)
- Connects Claude to agentinbox-mcp tools when it wakes
- Required for get_pending_tasks, complete_task, etc. to work

### agentinbox-mcp (v0.1.5 — published on npm)
- 9 MCP tools: get_pending_tasks, get_task, get_file, update_task_status, complete_task, escalate_task, propose_plan, ask_developer, notify_developer
- complete_task accepts screenshot_base64 for proof attachment

### Setup endpoint (GET /api/setup/download)
- Returns a plain text prompt pre-filled with the developer's workspace token + submit link
- 12 steps: scan codebase → install socket.io-client → worker.js → .mcp.json → startup scripts → OS startup → CLAUDE.local.md → rules/ → .gitignore → start worker immediately (no reboot needed) → report back
- Always writes `## Verification` section to CLAUDE.local.md (auto-detects real start command + port from package.json, config files, README)
- No manual Telegram config — worker fetches creds from server on connect

### Core Infrastructure
- Express + Socket.io server (SQLite locally, Turso on Render)
- PM dashboard — task list, detail panel, approval controls, screenshot card
- Submission form — file upload, custom fields, priority, constellation animation
- Auth — JWT login/signup, workspace management
- Approval gate — per-project toggle, Claude proposes plan before touching code; PM approval emits WebSocket to wake Claude immediately
- Screenshot verification — **per-task toggle on submission form** (not a project setting); submitter checks "Take screenshot after fix for proof" when submitting; worker takes Playwright screenshot after Claude exits and sends photo to Telegram; zero Claude tokens used for screenshots
- **Telegram screenshot verification toggle** — PM dashboard → Settings → Telegram → "Take screenshot after fix for Telegram tasks"; when ON, every task created from a Telegram message automatically gets `require_verification=true`; stored as `telegram_screenshot_verification` on the workspace; no need to touch the form or add flags manually
- Telegram per-workspace — each developer connects their own bot via PM dashboard UI
- Two Telegram task sources: website form + direct bot message
- Bidirectional Telegram: approve/reject/answer questions via reply, ✅ on completion
- Task type selector on submission form — Bug / Feature / Other; Telegram shows ✨/🐛/💬 accordingly
- Playground — animation + chat live demos (conversion tool)

---

## Testing Status — PASSED (Jun 5–9, 2026)

| Test | Coverage | Result |
|---|---|---|
| Simulation — 4 stacks | React, Node, Python, Laravel | ✅ 4/4 |
| Messy codebase — 5 scenarios | Monorepo, legacy, no docs, mixed, 345 files | ✅ 5/5 |
| Complex multi-file bugs — 5 scenarios | Hidden bugs across 3-4 files, no hints | ✅ 5/5 |
| Manual — new developer onboarding | Fresh signup → setup → submit → fix → screenshot | ✅ |
| Manual — Telegram bidirectional | Message bot → fix → ✅ back on Telegram | ✅ |
| Feature submission + approval gate | Submit feature → plan proposed → PM approves → Claude implements | ✅ |
| Task type Telegram label | ✨ New feature / 🐛 New bug / 💬 New request on Telegram | ✅ |
| End-to-end screenshot proof | Feature task + bug task on fresh project (test-demo-app) — both received Telegram ✅ + 📸 photo | ✅ |
| Per-task screenshot toggle | Two tasks submitted — one with screenshot, one without — each behaved correctly | ✅ |
| Telegram screenshot toggle | PM dashboard toggle ON → Telegram message → task created with require_verification=true → screenshot photo sent back | ✅ |

**100% production ready. First customers can onboard today.**

## Reliability Fixes — Applied (Jun 8, 2026)

| Scenario | Root Cause | Fix |
|---|---|---|
| N×M Claude spawns | `emitTaskCreated` broadcast to all sockets in room; stale sockets accumulate per VS Code session | Server tracks latest agent socket per workspace, emits only to that one |
| Stale lockfile deadlock | `.agentinbox-running` never cleaned up after crash/reboot; all future tasks silently dropped | Lockfile treated as stale after 15 min, auto-deleted |
| Task stuck in `in_progress` forever | Claude crashes after `update_task_status(in_progress)` but before `complete_task`; task invisible to next spawn | `get_pending_tasks` resets and returns `in_progress` tasks older than 15 min |
| Race — two Claudes on same task | No atomic claim; both see `pending`, both work in parallel, duplicate Telegram notifications | `update_task_status(in_progress)` uses `WHERE status = 'pending'` — only one wins; loser gets HTTP 409 |
| `ask_developer` / `propose_plan` infinite token burn | TASK_PROMPT told Claude to poll every 30s with no timeout | TASK_PROMPT now caps poll loops at 5 minutes |

---

## How to Run

**Production:** https://useagentinbox.com (Render, auto-deploys from main)

**Local dev:**
```powershell
cd packages/server && node dist/cli.js start
```

Server runs on port 3001. UI served from `ui-dist/`.

---

## Credentials

- Login: robin.devkota@amniltech.com / Super@123
- Workspace token (Render): wt_cAyY3qI_a3TsfKAO8Z4idI9Nl7muGxva
- MBL project submission token (Render): RqUi3neoyyq-94nCD-heC8Yv6acZX00w
- MBL worker: d:\mbl-account-opening\agentinbox-worker.js
- npm: agentinbox-mcp@0.1.5

---

## Telegram — Full Detail

### Two task sources
```
Source 1: Website submission form
  → task created → Telegram: "🐛 New bug" / "✨ New feature" / "💬 New request" → Claude wakes
  (label depends on Bug / Feature / Other selected in the form)
  → file/image attachments supported — stored on task, Claude reads them

Source 2: You message the Telegram bot (non-reply message)
  → task created from your message → Telegram: "⚡ Task created" → Claude wakes
  → photo or document attached to message → downloaded and stored on task — Claude reads it
  → caption + file supported (caption = description, file = attachment)
```

Only messages from the configured chat ID are accepted — no one else can trigger tasks.
One bot per workspace — by design. Sharing a bot across workspaces causes both workers to race.

### Bidirectional control (reply to a bot message)
- Approval needed → Claude sends plan → you reply "approve" or "reject: reason"
- Claude asks a question → you reply → Claude reads developer_reply and continues
- Task complete → Telegram: "✅ Fixed — Proof posted to dashboard"

### Configure via PM dashboard
PM dashboard → Settings → Telegram → enter bot token, chat ID, default project

#### Screenshot verification for Telegram tasks
Toggle: "Take screenshot after fix for Telegram tasks"
- When ON: every task created from a Telegram message gets `require_verification=true` automatically
- Worker fires Playwright screenshot after Claude exits, sends photo back to Telegram
- Stored as `telegram_screenshot_verification` on the workspace (DB column, auto-migrated)
- Web form tasks have their own separate per-task toggle — these are independent

---

## Not Built Yet (priority order)

1. **Stripe billing** — zero revenue without it (2 days)
2. **Show HN / launch post** — after Stripe is live
3. **Slack webhook** — sticky feature, PMs love it (1 day)
4. **Email notifications** — fallback when Telegram not configured (4 hours)
5. **SLA/stats dashboard** — renewal justification (2 hours)
6. **PDF weekly report** — PM sends to client, subscription becomes unkillable (1 day)
