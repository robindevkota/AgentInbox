# AgentInbox — Full Product Plan

> An open-source AI-powered task inbox where non-technical users submit bugs and features, and an autonomous Claude agent executes them, commits the code, and reports back with a screenshot.

---

## The Problem

Every software agency runs the same painful chain:

```
Client / End User
  → WhatsApp / Email to PM
    → PM messages Developer
      → Dev fixes it
        → Dev tells PM
          → PM tells Client
```

**5 human handoffs. Zero of them add value.**

The developer gets interrupted. The PM becomes a messenger. The client waits.

No tool fixes the full loop. Jira manages tasks but doesn't execute them. Devin executes but has no client intake. GitHub Copilot helps developers but needs a developer to drive it. Nobody owns the full chain: **intake → execute → report back**.

That gap is AgentInbox.

---

## What AgentInbox Is

Two parts:

| Part | What it is | How you get it |
|------|-----------|----------------|
| **Server + dashboard** | Hosted web app — task queue, PM dashboard, submission form | Use hosted at `agentinbox-k2vf.onrender.com` — or self-host |
| **`agentinbox-mcp`** | npm package running inside Claude Code | Auto-fetched via `npx` when Claude Code starts |

You do **not** clone the repo. You do **not** install a server. Sign up, add 8 lines to `.mcp.json`, done.

---

## How It Works

```
Client opens submission link (no account needed)
  └── agentinbox-k2vf.onrender.com/submit/<project-token>
  └── Types: "login button broken on mobile"
  └── Optionally uploads: screenshot.png / spec.pdf

Task lands in AgentInbox  (status: pending)

agentinbox-mcp (running inside Claude Code) receives it via WebSocket
  └── No ngrok. No router. No extra terminals.
  └── Claude Code opens → MCP auto-connects → tasks flow in real time

Claude works in the real project repo
  └── Reads CLAUDE.md + .claude/rules/ for codebase context
  └── Finds bug / builds feature
  └── Takes Playwright screenshot of live result

Claude calls complete_task(id, technical, plain, screenshot_base64)
  └── Technical summary: "Fixed null check in LoginButton.tsx line 47. PR #52."
  └── Plain English: "The login button on mobile is fixed."
  └── Screenshot: rendered inline in PM dashboard

PM sees live toast notification + green check — no refresh needed
Client sees status page update: Done ✓
```

---

## Architecture

```
AgentInbox (hosted or self-hosted)      Developer's machine
─────────────────────────────────────   ──────────────────────────────────
Auth + workspace management             agentinbox-mcp  (npm package)
Turso/SQLite task queue                   └─ WebSocket → server (outbound)
File storage (base64 in DB)               └─ REST calls /api/agent/*
React PM dashboard                      Claude Code CLI
Client submission form                  Project codebase
REST + WebSocket API                    CLAUDE.md + .claude/rules/
Real-time PM notifications              CLAUDE.local.md  (gitignored)
```

AgentInbox holds the queue and UI. Your local Claude does the actual work. No ngrok, no router.

---

## Current Status — May 2026

### ✅ Fully live on Render

- PM dashboard: `https://agentinbox-k2vf.onrender.com/pm`
- Submit form: `https://agentinbox-k2vf.onrender.com/submit/<token>`
- Persistent DB via Turso — survives redeploys
- Auth: email + password, JWT sessions, 30-day tokens
- `BILLING_ENABLED=false` — all signups get Pro during testing week

### ✅ Phase 1 — Socket server (replaces ngrok + router)
- `socket.io` on server — `packages/server/src/socket/manager.ts`
- Workspace token auth on connect (`wt_` prefixed)
- `emitTaskCreated` fires to agent room on submit
- Agent-facing REST routes under `/api/agent/` using `x-workspace-token`
- Webhook fallback still supported for legacy setups

### ✅ Phase 2 — `agentinbox-mcp` npm package
- Published to npm as `agentinbox-mcp`
- Socket connect with workspace token auth (auto-reconnect)
- 7 MCP tools: `get_pending_tasks`, `get_task`, `get_file`, `update_task_status`, `complete_task`, `escalate_task`, `propose_plan`
- Express JSON body limit 10mb (handles base64 screenshots)
- `complete_task` screenshot_base64 fixed and tested end-to-end

### ✅ Phase 3b — PM real-time notifications
- PM dashboard connects via socket using JWT Bearer token
- PM room `pm:<workspaceId>` separate from agent room `ws:<workspaceId>`
- 4 events emitted to PM: `task.submitted`, `task.done`, `task.escalated`, `task.approval_needed`
- Toast stack in bottom-right with Web Audio API sounds (no dependency)
- Green = done, red = escalated, amber = approval needed, white = new submission
- Tab title badge: `(3) AgentInbox` when unread
- Toasts auto-dismiss after 5s, clickable to dismiss early
- Tested locally + on Render production

### ✅ Full feature set working
- Custom fields (dropdown + text) per project
- File upload with image/PDF preview in PM dashboard
- Approval gate — Claude proposes plan, PM approves/rejects
- Task comments — PM adds context, visible in task detail
- Audit log — every status change recorded with actor + timestamp
- Re-open tasks — PM can send done/failed tasks back to pending
- Usage stats dashboard per workspace
- White label — brand name, color per project
- Client task status page (shareable, no account needed)

---

## MCP Tools

| Tool | What it does |
|------|-------------|
| `get_pending_tasks()` | All unstarted tasks in the workspace |
| `get_task(id)` | Full detail including custom fields and parsed file content |
| `update_task_status(id, status)` | Sets `in_progress`, `failed`, or `blocked` |
| `complete_task(id, technical, plain, pr_link?, screenshot_base64?)` | Summaries + screenshot, marks done, notifies PM |
| `get_file(task_id)` | Parsed content of uploaded PDF/image/doc |
| `escalate_task(id, reason)` | Flags for human review, notifies PM with red toast |
| `propose_plan(id, plan)` | Proposes fix — PM approves before Claude executes |

---

## Priorities Before Paid Launch

### 🔴 Must do

| # | What | Status |
|---|------|--------|
| 1 | PM socket notifications with sound | ✅ Done |
| 2 | Publish `agentinbox-mcp` to npm | ✅ Done |
| 3 | Stripe billing | ⬜ Not started |

### 🟡 After first 3 paying customers

| # | What | Why |
|---|------|-----|
| 4 | Screenshot storage on Cloudflare R2 | Render filesystem resets — base64 in DB is fine short-term |
| 5 | Self-serve onboarding (token issued via Stripe flow) | Manual token issuance works for first 5 customers |

### 🟢 Later (5+ paying customers)

- Enterprise: SSO, audit log export, SLA docs
- Platform admin dashboard

---

## Stripe Plan (Phase 3 — next)

What to build:
1. `POST /api/billing/checkout` → Stripe Checkout session for selected plan
2. Webhook: `checkout.session.completed` → set workspace `plan` + `plan_expires_at`
3. Webhook: `customer.subscription.deleted` → downgrade to free
4. Upgrade banner in PM dashboard when on free plan or near task limit
5. Flip `BILLING_ENABLED=true` in Render env vars

Already built that makes this easy:
- `plan` column on workspaces (`free`, `starter`, `growth`, `pro`)
- `FREE_TASK_LIMIT = 50` enforcement already in routes.ts
- Upgrade banner already renders in UI when limit hit
- `BILLING_ENABLED` env var toggle

### Pricing

| Plan | Price | Projects | What you get |
|------|-------|----------|-------------|
| Starter | $19/mo | 2 | Dashboard, MCP, basic support |
| Growth | $49/mo | 10 | Everything in Starter + priority support |
| Pro | $99/mo | Unlimited | Multiple workspaces, agencies |
| Enterprise | Custom | Unlimited | SLA, onboarding, compliance docs |

---

## Go-to-Market

**Current plan (May 2026):**
1. Post on X, Reddit (r/SideProject, r/ClaudeAI), HN Show HN
2. Open source for 1 week — collect GitHub stars + waitlist signups
3. If 10+ people ask "how do I set this up?" → build Stripe, launch paid
4. First 3 customers onboarded manually (token issued by hand)
5. After revenue: self-serve onboarding, then Stripe

**The pitch:**
> Your PM, QA, or client submits a bug through a simple web form — no account needed. Your Claude agent picks it up, fixes it in your codebase, and posts a screenshot back to the dashboard as proof. Your PM sees it done without ever talking to a developer. Setup is 8 lines in your Claude config. You bring your own Claude key — we just connect the pipe.

---

## Market Position

| Tool | Non-tech intake | Auto executes | Reports back |
|------|----------------|---------------|-------------|
| Linear / Jira | partial | no | no |
| Devin / SWE-agent | no | yes | no |
| GitHub Copilot | no | dev drives it | no |
| **AgentInbox** | **yes** | **yes** | **yes** |

Nobody owns all three columns. Closest competitor is Devin at $500/month — no client intake, no multi-project, no PM layer.

---

## Self-Hosting (for developers who want to run their own server)

```bash
git clone https://github.com/robindevkota/AgentInbox
cd AgentInbox
pnpm install
pnpm --filter @agentinbox/ui build
node packages/server/scripts/copy-ui.js
cd packages/server && pnpm build && cd ../..
node packages/server/dist/cli.js start --port 3000
```

Sign up at `http://localhost:3000/signup`. Add `AGENTINBOX_URL=http://localhost:3000` to `.mcp.json` env.

Or: `docker compose up`

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Server | Node.js + TypeScript + Express |
| Task queue | SQLite (local) / Turso (production) |
| Real-time | Socket.io (agent + PM rooms) |
| File parsing | pdf-parse + mammoth + base64 images |
| UI | React + Vite + Tailwind |
| Auth | JWT (PM) + workspace tokens (agent) + public project tokens (submit) |
| MCP | `agentinbox-mcp` npm package |
| Hosting | Render (server) + Turso (DB) |

---

*MIT License. Works with Claude Code, Claude Desktop, and any MCP-compatible Claude setup.*
