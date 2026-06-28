# AgentInbox

## On every session start
Read AGENTINBOX_PLAN.md for full context on what's built and what's next.

## Key docs
| Doc | Purpose |
|---|---|
| AGENTINBOX_PLAN.md | Architecture, credentials, what's built, what's next |
| SETUP.md | Developer setup guide (what new users follow) |
| BACKLOG.md | Prioritised feature backlog |
| packages/mcp/src/index.ts | agentinbox-mcp npm package source |
| packages/server/src/api/routes.ts | All API routes including /setup/download |
| packages/server/src/socket/manager.ts | WebSocket rooms + emitTaskCreated |
| packages/server/src/telegram/bot.ts | Per-workspace Telegram polling |

## Architecture in one line
Task submitted → WebSocket push (task.created) → agentinbox-worker.js spawns Claude headlessly → Claude fixes → exits. No polling. No VS Code needed.

## Chat with Claude (Jun 28, 2026)
PM dashboard sidebar → 💬 Chat with Claude. Lets you talk to Claude about your codebase from the browser — no API key, uses your Claude Code subscription.

**How it works:**
```
PM types message in chat UI
  → POST /api/chat/sessions/:id/messages
  → emitChatMessage(workspaceId, {sessionId, userMsgId, prompt}) — WebSocket push to worker
  → worker.spawnClaudeChat() — spawns: claude --dangerously-skip-permissions --print --max-budget-usd 0.50 "<prefix> + prompt"
  → Claude replies (conversational), captures stdout
  → worker POSTs reply to /api/chat/reply
  → server saves assistant message + emits chat.reply via WebSocket
  → UI shows reply in real time
  → Claude exits — zero polling, zero idle tokens
```

**Instruction prefix (anti-tool-burn):**
Worker prepends a fixed prefix to every chat prompt telling Claude to answer conversationally and only use tools when explicitly asked (create_task, get_pending_tasks). Prevents Claude burning tokens on unnecessary tool calls for simple questions.

**Create task from chat:**
Claude can call `create_task` MCP tool when asked ("add a task to fix X"). The tool is in:
- `packages/server/src/mcp/tools.ts` — local MCP server (used by headless Claude spawns)
- `packages/mcp/src/index.ts` — npm package (used by interactive Claude sessions)

`create_task` calls `list_projects` first to get project IDs, then creates task + emits `task.created` to wake the worker. Task shows up in dashboard as `Claude (chat)` submitter.

**TODO — same feature for Telegram:**
A developer should be able to message the Telegram bot conversationally (not just submit tasks). The worker should detect whether an incoming Telegram message is a task submission or a chat question, and route accordingly — same `spawnClaudeChat` flow but replying via Telegram instead of WebSocket. Not yet built.

**Files:**
- `packages/server/src/api/routes.ts` — chat API routes + `/chat/reply` + `spawnClaudeChat` in worker template
- `packages/server/src/socket/manager.ts` — `emitChatMessage` export
- `packages/server/src/mcp/tools.ts` — `list_projects` + `create_task` MCP tools
- `packages/ui/src/pm/PmDashboard.tsx` — `ChatView` component + `MarkdownContent` renderer
- `packages/queue/db.ts` — `chat_sessions` + `chat_messages` tables

## How the wake-on-task pipe works
```
Client submits bug via submission form
  → POST /api/submit/:token
  → task stored in DB
  → emitTaskCreated(workspaceId, payload) — WebSocket push to agent room
  → agentinbox-worker.js (running silently on developer's PC) receives it
  → spawnClaude() — spawns: claude --dangerously-skip-permissions --print "check pending tasks..."
  → Claude processes all pending tasks, calls complete_task, exits
  → worker resets claudeRunning = false, listens for next task
  → Telegram ✅ sent on complete_task
```

## The worker (agentinbox-worker.js)
- A standalone Node.js script written to the developer's project root during setup
- Connects to AgentInbox via socket.io WebSocket — NOT via .mcp.json
- Has its own socket.io-client (installed in project root node_modules)
- Uses in-memory `claudeRunning` flag — no lockfile, no cross-process conflicts
- Logs to `agentinbox.log` in project root
- Started silently on PC boot via `agentinbox-start.bat` + `agentinbox-start.vbs` (Windows)
  or `agentinbox-start.sh` + launchd plist (Mac)
- Token and paths passed via env vars in the bat/sh file — not hardcoded in worker.js

## Why NOT .mcp.json for wake-on-task
.mcp.json ties agentinbox-mcp to the interactive Claude session. When the developer is
actively chatting with Claude, spawnClaude() is blocked (claudeRunning = true in that process).
The standalone worker runs in a completely separate process — no conflict.

## agentinbox-mcp (npm package) — separate concern
- Still published on npm (v0.1.5) — used for MCP tools inside Claude sessions
- Gives Claude the 9 tools: get_pending_tasks, get_task, complete_task, etc.
- The MCP tools are what Claude calls during task processing
- The wake-on-task WebSocket logic is also in the package but secondary to the standalone worker

## Rules
- NEVER add polling loops — wake-on-task via WebSocket push is the pattern
- NEVER modify the worker to use lockfiles — in-memory claudeRunning flag is correct
- agentinbox-mcp npm package: rebuild (tsc) + publish after any change to packages/mcp/src/
- Server is on Render — run tsc in packages/server/ then push to deploy
- Setup prompt lives in routes.ts /setup/download — update it when the worker pattern changes

## Reliability fixes applied (Jun 8, 2026) — DO NOT regress these

### Fix 1 — Socket deduplication (manager.ts)
`emitTaskCreated` must emit only to the LATEST agent socket per workspace, not the whole room.
The `latestAgentSocket` Map in manager.ts tracks this. NEVER change emitTaskCreated to
`io.to('ws:<workspaceId>').emit(...)` — that broadcasts to every stale VS Code session and
causes N×M Claude spawns (N tasks × M open sessions).

### Fix 2 — Stale lockfile guard (mcp/src/index.ts)
`isTaskClaudeRunning()` checks lockfile AGE — treats it as stale after 15 minutes and deletes it.
NEVER revert to `return existsSync(LOCKFILE)` alone — a crash or reboot leaves the lockfile
forever and all future tasks are silently dropped.

### Fix 3 — Stuck task recovery (tasks.ts getPendingTasks)
`getPendingTasks` returns tasks stuck in `in_progress` for over 15 minutes (Claude crashed
mid-task) and resets them to `pending`. NEVER query only `status = 'pending'` in this function —
that makes crashed tasks invisible forever and they pile up in the DB unresolved.

### Fix 4 — Atomic race claim (tasks.ts updateStatus + routes.ts)
`updateStatus(id, 'in_progress')` uses `WHERE status = 'pending'` — only one Claude wins when
two race. Returns `undefined` if claim lost; route returns HTTP 409. NEVER change this to an
unconditional UPDATE — two Claudes would both work the same task and send duplicate notifications.

### Fix 5 — Idempotent complete_task (tasks.ts completeTask + routes.ts + mcp/tools.ts)
`completeTask` returns `{ task, wasAlreadyDone }`. Telegram and PM socket events are only fired
when `wasAlreadyDone === false`. NEVER fire notifications unconditionally on every complete_task
call — duplicate ✅ Done messages flood the developer's Telegram.

## Credentials (production)
- Login: robin.devkota@amniltech.com / Super@123
- Workspace token: wt_cAyY3qI_a3TsfKAO8Z4idI9Nl7muGxva
- Production URL: https://useagentinbox.com (hosted on Railway, DNS on Cloudflare)
- npm package: agentinbox-mcp@0.1.9 (latest — includes create_task tool)
