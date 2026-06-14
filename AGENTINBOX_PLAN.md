# AgentInbox — Current State (June 14, 2026 — updated)

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
Claude (woken on demand, one task per spawn)
  → reads .mcp.json, connects to AgentInbox MCP tools
  → claims one task, fixes it, calls complete_task (with verification_url if UI built), exits
Worker (after Claude exits)
  → screenshot fires in background if require_verification=true
  → immediately calls checkAndSpawnNext() — picks up next pending task in parallel
  → repeats until queue is empty
PM dashboard
  → sees task done with proof + screenshot in real time
Telegram
  → ⚡ on submit, 📸 single photo with screenshot on complete (when require_verification=true)
  → ⚡ on submit, ✅ text on complete (when require_verification=false)
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

### One-Claude-per-task (worker)
Each task gets its own Claude spawn — Claude processes one task, calls `complete_task`, exits.

```
Task 1 arrives → spawn Claude → fix task1 → complete_task(verification_url) → Claude exits
  → screenshot task1 fires in background (non-blocking)
  → checkAndSpawnNext() immediately fetches next pending task
  → Task 2 pending → spawn Claude for task2 (parallel with task1 screenshot)
  → Task 2 done → screenshot task2, check for task3...
```

Benefits:
- Every task gets its own screenshot — no more "only last task gets screenshotted"
- Every task gets its own 10-min timeout — 5 tasks never hit a shared timeout
- Priority order preserved — server returns highest priority task first on each `checkAndSpawnNext()` call
- `claudeRunning` flag still prevents two Claudes in same process

The worker uses in-memory `claudeRunning` boolean — no lockfile needed.
The MCP package (`agentinbox-mcp`) still uses a lockfile with a 15-minute stale guard for the interactive Claude session path.

### Safety guards — Claude never picks a completed task

Three independent layers prevent a done task from being processed twice:

| Guard | Where | What it does |
|---|---|---|
| `seenTaskIds` Set | Worker in-memory | Prevents duplicate socket events for the same task — `checkAndSpawnNext` passes `null` taskId so legitimate retries are never blocked |
| Atomic claim | `tasks.ts updateStatus` | `WHERE status = 'pending'` — if task is already `in_progress` or `done`, DB update changes 0 rows, returns 409 to Claude |
| `getPendingTasks` filter | `tasks.ts` | Only returns `status = 'pending'` OR `in_progress > 15min` — `done` tasks never appear in the list |

Claude calling `complete_task` on an already-done task is also safe — `wasAlreadyDone` flag suppresses duplicate Telegram notifications.

### Worker auto-restart (no manual input ever)
`start.bat` runs an infinite loop — if `worker.js` crashes or exits for any reason, it restarts automatically in 5 seconds:
```bat
:loop
node worker.js >> worker.log 2>&1
timeout /t 5 /nobreak > nul
goto loop
```
On PC boot: `agentinbox-start.vbs` (Windows) / launchd plist (Mac) launches `start.bat` silently. Developer never needs to touch a terminal.

### Race prevention (atomic claim)
`update_task_status(in_progress)` uses `WHERE status = 'pending'` — only one Claude wins if two race.
The server returns HTTP 409 to the loser; Claude skips and moves to the next task.

### Stuck task recovery
`get_pending_tasks` also returns tasks stuck in `in_progress` for over 15 minutes (Claude crashed mid-task).
Those tasks are reset to `pending` automatically before being returned, so they get retried.

### Socket deduplication
The server tracks only the **latest** agent socket per workspace in memory.
`emitTaskCreated` sends to that one socket only — not the whole room.
Prevents N VS Code sessions × M tasks = N×M Claude spawns.

### Screenshot verification (require_verification=true)
When a project has screenshot verification enabled:
- Worker starts the app (from `CLAUDE.local.md` → `## Verification` → `Start:` and `URL:`)
- Kills the server by **port** in `finally` (not PID) — reliable on Windows where npx spawns via cmd.exe
- Server sends **no** Telegram text on `complete_task` when `require_verification=true` — worker sends the single photo instead
- Claude timeout: **5 minutes** — uses `taskkill /F /T /PID` (SIGTERM is ignored on Windows); task marked `failed` on timeout

**Screenshot hardening (Jun 12, 2026):**
- **30-minute window + newest first** — picks the most recently modified HTML file within last 30 min, not a fixed `spawnedAt` time. Correctly handles consecutive tasks (Task 2's file is newer than Task 1's).
- **Idempotent** — before taking screenshot, checks if task already has `screenshot_base64`. Skips if yes. Safe to call after worker restart mid-task — no duplicate Telegram photos.
- **Workspace flag** — `/api/agent/workspace` now returns `screenshot_verification`. Worker reads it on every connect as `SCREENSHOT_VERIFICATION`. Screenshot runs after Claude exits if `require_verification=true` on the task OR if the workspace flag is true — whichever applies.
- **Project inheritance** — tasks created via API/form now inherit `require_verification=1` from the project if not explicitly set in the submission body. Previously only Telegram tasks got it automatically.
- **Safe worker restart** — `start.bat` writes `worker.pid` on startup, and on restart only kills that specific PID instead of `taskkill /F /IM node.exe /T` (which was killing IDE extensions and breaking Claude mid-task).

**`verification_url` — Claude tells worker what to screenshot (Jun 12, 2026):**
- Claude calls `complete_task(id, ..., verification_url="http://localhost:3000/result.html")`
- Worker reads `verification_url` from the task after Claude exits — screenshots that exact URL, no guessing
- Works for any stack: React (`http://localhost:3000`), Flask (`http://localhost:5000`), static HTML, anything with a URL
- Falls back to 30-min HTML scan if `verification_url` is not set (backwards-compatible for HTML-only projects)
- Zero extra Claude tokens — Claude just passes a string, worker does all the Playwright work
- `verification_url` stored in DB (`tasks.verification_url` column, auto-migrated); visible in task API response

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
- **One task per Claude spawn** — Claude fixes one task and exits; `checkAndSpawnNext()` immediately picks up the next
- Spawns `claude --dangerously-skip-permissions --print "<task prompt>" --max-budget-usd 3.00`
- Logs to `agentinbox.log` in project root
- Token + project path passed via env vars in startup bat/sh — not hardcoded
- On connect: fetches Telegram bot token + chat ID + `screenshot_verification` flag from `/api/agent/workspace`
- After Claude exits: takes screenshot if task has `require_verification=true` OR workspace `SCREENSHOT_VERIFICATION=true`
- Screenshot flow: idempotent check → kills port → starts app → polls URL → uses **`verification_url` from task if Claude set it** (exact URL), falls back to most recently modified HTML within 30 min → takes screenshot → kills serve → sends photo to Telegram
- Serve process kill: uses `taskkill /F /T` (full process tree) — `SIGTERM` on Windows does not cascade to child processes
- `worker.pid` written on startup so `start.bat` kills only this worker on restart — not all node processes

### .mcp.json (per-project, written during setup)
- Connects Claude to agentinbox-mcp tools when it wakes
- Uses `node node_modules/agentinbox-mcp/dist/index.js` — NOT `npx -y agentinbox-mcp`
- Local install avoids npm registry hit on every Claude spawn (was causing MCP cold-start hang)
- Required for get_pending_tasks, complete_task, etc. to work

### agentinbox-mcp (v0.1.5 — published on npm)
- 9 MCP tools: get_pending_tasks, get_task, get_file, update_task_status, complete_task, escalate_task, propose_plan, ask_developer, notify_developer
- complete_task accepts optional `verification_url` (worker screenshots it) and `screenshot_base64` (direct proof attachment)

### Setup endpoint (GET /api/setup/download)
- Returns a plain text prompt pre-filled with the developer's workspace token + submit link
- 11 steps: scan codebase → install socket.io-client → worker.js → `npm install agentinbox-mcp --save` → .mcp.json (local node path) → startup scripts → OS startup → CLAUDE.local.md → rules/ → .gitignore → start worker immediately (no reboot needed) → report back
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
- **Feedback page** — PM dashboard sidebar → 💬 Feedback → category selector + message → POST `/api/feedback` → Resend sends from `feedback@useagentinbox.com` → Cloudflare Email Routing forwards to Robin's Gmail

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
| Consecutive tasks — correct screenshot per task | Task 1 (blue-star.html) → Task 2 (orange-triangle.html) submitted immediately after — each task received screenshot of its own output, not the previous task's | ✅ Jun 12 |
| Text/MD task via Telegram | Message bot with text → Claude wakes, reads task, completes in ~60s | ✅ Jun 14 |
| File attachment task via Telegram | Attach spec.md → Claude reads file via get_file, builds to spec, exits clean | ✅ Jun 14 |
| Image task via Telegram | Send screenshot → Claude reads image as vision block via get_file, builds matching page | ✅ Jun 14 |

**100% production ready. First customers can onboard today.**

## Reliability Fixes — Applied (Jun 8, 2026)

| Scenario | Root Cause | Fix |
|---|---|---|
| N×M Claude spawns | `emitTaskCreated` broadcast to all sockets in room; stale sockets accumulate per VS Code session | Server tracks latest agent socket per workspace, emits only to that one |
| Stale lockfile deadlock | `.agentinbox-running` never cleaned up after crash/reboot; all future tasks silently dropped | Lockfile treated as stale after 15 min, auto-deleted |
| Task stuck in `in_progress` forever | Claude crashes after `update_task_status(in_progress)` but before `complete_task`; task invisible to next spawn | `get_pending_tasks` resets and returns `in_progress` tasks older than 15 min |
| Race — two Claudes on same task | No atomic claim; both see `pending`, both work in parallel, duplicate Telegram notifications | `update_task_status(in_progress)` uses `WHERE status = 'pending'` — only one wins; loser gets HTTP 409 |
| `ask_developer` / `propose_plan` infinite token burn | TASK_PROMPT told Claude to poll every 30s with no timeout | TASK_PROMPT now caps poll loops at 5 minutes |

## Pipeline Fixes — Applied (Jun 14, 2026)

| Scenario | Root Cause | Fix |
|---|---|---|
| Task 2 silently dropped when Claude busy | `checkAndSpawnNext()` passed task2_id to `spawnClaude()` — hit `seenTaskIds` block from earlier socket event | `checkAndSpawnNext()` now passes `null` taskId — dedup only guards socket events, not retries |
| MCP cold-start hang on every Claude spawn | `.mcp.json` used `npx -y agentinbox-mcp` — npm registry hit per spawn; slow network = infinite hang | Setup now installs `agentinbox-mcp` locally + uses `node node_modules/...` path in `.mcp.json` |
| Worker timeout never fired on Windows | `proc.kill("SIGTERM")` is ignored by Windows | Timeout now uses `taskkill /F /T /PID` to kill full process tree; timeout reduced 10min → 5min |
| Image tasks always hung / crashed silently | `get_task` returned full task object including `file_data` (raw base64 image ~18KB); blob overflowed MCP stdio pipe | Strip `file_data` and `screenshot_base64` from `get_task` + `get_pending_tasks`; Claude calls `get_file` separately which returns a proper vision block |
| Telegram photo too low-res for Claude to read UI | Picking `photos[length-2]` (second-highest) — often 800px, too blurry for UI details | Now picks highest-res photo ≤ 1280px — sharp enough for Claude, avoids 2560px context blowout |

## Screenshot Pipeline Fixes — Applied (Jun 12, 2026)

| Scenario | Root Cause | Fix |
|---|---|---|
| Wrong screenshot sent (previous task's file) | `spawnedAt` filter was too strict — new worker spawned after restart had a later `spawnedAt` than files written by previous Claude | 30-minute window + newest-first sort — picks most recently modified HTML within last 30 min, not fixed `spawnedAt` |
| start.bat kills IDE extensions + breaks Claude mid-task | `taskkill /F /IM node.exe /T` kills ALL node processes on the machine | PID file written on worker start; start.bat reads and kills only that PID on restart |
| Screenshot skipped for API/form submissions | Task `require_verification` defaulted to false for web form; only Telegram tasks inherited project setting | Routes.ts now sets `require_verification = true` if project has `require_verification = 1`, regardless of submission source |
| Screenshot skipped after worker restart | Worker restarted mid-task with fresh in-memory state; new process had `SCREENSHOT_VERIFICATION = false` | `/api/agent/workspace` now returns `screenshot_verification`; worker reads it on every connect as fallback |
| Duplicate Telegram photos after worker restart mid-screenshot | Worker crashed after attaching screenshot but before Telegram send; on restart, screenshot triggered again | Idempotent check at start of `takeScreenshotAndAttach` — skips if task already has `screenshot_base64` |

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
