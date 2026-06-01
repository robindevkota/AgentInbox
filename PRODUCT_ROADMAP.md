# AgentInbox — Product Roadmap & Monetization Strategy
> Last updated: May 2026

---

## What We Are Building

A **workflow bridge** — not an AI, not an IDE plugin. AgentInbox connects non-technical users (PM, QA, clients) to an organization's own Claude agent. The org brings their own Claude API key and their own codebase. We provide the intake, the dashboard, and the connection layer.

```
PM / QA / Client
    ↓  submits bug via browser (no account needed)
AgentInbox Server  (we host this)
    ↓  emits task to connected agent
Client's Claude Code  (they run this, their API key, their cost)
    ↓  fixes the code in their codebase
AgentInbox Server
    ↓  stores result + screenshot
PM Dashboard  (they see proof it's done)
```

**We own the pipe. They own the AI.**

This means:
- Zero Claude API cost on our side
- Our margin is ~100% of the SaaS fee
- We are responsible for workflow, not correctness of fixes

---

## The Core Problem With Current Setup

Right now the connection between AgentInbox and the client's Claude agent requires:

1. **ngrok** — a terminal that must stay running, exposes their machine publicly
2. **claude-router.js** — another terminal that must stay running, spawns Claude on webhook

**This is not sellable.** No corporate client will run two terminals indefinitely just to receive bug tasks.

---

## The Fix — WebSocket + MCP Package

### How it works

Reverse the connection direction. Instead of our server pushing to their machine (requiring ngrok), their agent connects OUT to our server on startup:

```
Client's machine boots Claude Code
    ↓
agentinbox-mcp package connects outbound WebSocket to our server
    ↓  (using their workspace token for auth)
Server validates token, assigns to their workspace
    ↓
Task submitted by PM
    ↓
Server emits directly to their connected socket
    ↓
Claude processes it, posts result back
No ngrok. No router. No extra terminals.
```

### What the client does (one time setup)

Add 8 lines to their `.mcp.json`:

```json
{
  "mcpServers": {
    "agentinbox": {
      "command": "npx",
      "args": ["-y", "agentinbox-mcp"],
      "env": {
        "AGENTINBOX_TOKEN": "their-workspace-token"
      }
    }
  }
}
```

That is it. Every time they open Claude Code the MCP auto-connects. No terminal, no ngrok, no router.

### What `agentinbox-mcp` does (npm package we publish)

- Connects to our server via WebSocket using token
- Validates token — if expired/unpaid returns auth error
- Exposes MCP tools to Claude: `get_pending_tasks`, `update_task_status`, `complete_task`, `escalate_task`, `get_file`
- Receives task events from server in real time
- Claude processes them automatically via `scripts/agentinbox.md` prompt

---

## Token Architecture

### Granularity — per workspace (not per org, not per project)

- **Per org** = one token controls everything, leak = full compromise
- **Per project** = too much friction, 10 projects = 10 tokens to manage
- **Per workspace** = right balance. One org can have multiple workspaces (e.g. one per client they serve). Each workspace has one token. Revoke one without touching others.

### Token layers (security in depth)

| Layer | What it is | Lifetime |
|---|---|---|
| Workspace token | Long-lived, stored in their .mcp.json | Until cancelled or rotated |
| Session token | Issued on MCP connect, never stored | 15 minutes |
| Rotation policy | Forced rotation reminder | Every 90 days |

The workspace token **never travels over the wire after the initial handshake**. Only session tokens are used for actual API calls. If a session token is intercepted it is useless after 15 minutes.

### Token expiry and billing gates

```
Payment fails → Day 0:  warning email
               Day 3:  token downgraded (read-only, can't complete tasks)
               Day 7:  token suspended (MCP connects, returns 402)
               Day 30: token revoked, data export window opens
```

Never hard-cut on day 1 — corporate finance teams are slow. 7-day grace prevents churn from billing failures.

### Security features worth selling to corporates

- Every `complete_task` call logs: timestamp, task ID, Claude model used, tokens used
- Full audit trail — compliance requirement for banks and fintech
- Token rotation every 90 days — "security compliance" is a feature not a bug
- Rate limit: max 10 task submissions per minute per workspace (prevents runaway agents)
- Screenshot stored in R2 (Cloudflare), not in our DB — no PII in task store

---

## Pricing

### The right limits — projects, not tasks

Tasks/month is invisible to clients. They don't think "I have 47 tasks left." They think "I have 3 codebases I want to connect." Projects is tangible. They feel the limit when they hit it.

Concurrency (how many agents run at once) is meaningless to charge for — their Claude Pro subscription controls that, not us.

### Plans

| Plan | Price | Workspaces | Projects | What you get |
|---|---|---|---|---|
| Starter | $19/mo | 1 | 2 | Dashboard, MCP, basic support |
| Growth | $49/mo | 1 | 10 | Everything in Starter + priority support |
| Pro | $99/mo | 3 | Unlimited | Multiple workspaces, agencies/larger orgs |
| Enterprise | Custom | Unlimited | Unlimited | SLA, onboarding, compliance docs |

### Why this structure

- **Starter** — solo dev or small team testing. 2 projects is enough to see value, not enough to run a whole org on it. Natural upsell trigger.
- **Growth** — the real corporate sweet spot. One PM dashboard, all their repos, one monthly fee.
- **Pro** — agencies managing multiple clients in separate workspaces.
- **Enterprise** — banks, fintech, compliance-heavy orgs that need SLA and audit logs.

### Upsell path is natural

```
Starter → hits 2 project limit → upgrades to Growth    ($30 more/mo)
Growth  → needs separate workspace per client → Pro     ($50 more/mo)
Pro     → needs SLA/compliance docs → Enterprise
```

Each upgrade triggered by a real pain they hit, not an arbitrary counter.

### Our infrastructure cost at scale

- Render paid tier (always on): $7/mo
- Cloudflare R2 storage (screenshots): free up to 10GB, then $0.015/GB
- Turso DB: free up to 500MB

At 100 Growth plan customers: **$4,900/mo revenue vs ~$20/mo infra cost.**

---

## What We Are NOT

To stay focused, we are not building:

- The AI itself (client brings Claude)
- A code editor or IDE
- A replacement for GitHub/GitLab
- A general chat interface
- Anything requiring the client to have technical knowledge

---

## Current Priorities (May 2026)

> `BILLING_ENABLED=false` — all signups get Pro during testing. Do not enable until MBL pilot is stable and Stripe is wired.

### 🔴 Must Do Now

| # | Task | Why |
|---|---|---|
| 1 | **PM dashboard socket notifications with sound** | PM has no idea when a task is done. Currently must manually refresh. |
| 2 | **Stripe billing (Phase 3)** | Can't charge anyone. Needed before public launch. |
| 3 | **Publish `agentinbox-mcp` to npm** | Without this, clients must clone the repo. Blocks all onboarding. |

### 🟡 Do After First 3 Paying Customers

| # | Task | Why |
|---|---|---|
| 4 | Screenshot storage on Cloudflare R2 (Phase 4) | Render filesystem resets on redeploy — screenshots lost |
| 5 | Self-serve onboarding (Phase 5) | Manual token issuance doesn't scale past 5 clients |

### 🟢 Later (5+ paying customers)

- Enterprise features: SSO, audit log export, SLA docs (Phase 6)
- Platform admin dashboard — only if support burden grows

---

## Build Phases

### ✅ Phase 1 — Socket Server (replace ngrok + router)
> Completed May 2026

- [x] `socket.io` added to server — `packages/server/src/socket/manager.ts`
- [x] Workspace token auth on connect (`wt_` prefixed tokens stored in DB)
- [x] `workspace_token` column + migration in `db.ts`
- [x] `issueWorkspaceToken`, `rotateWorkspaceToken`, `getWorkspaceByToken` in `tasks.ts`
- [x] Token issue/rotate API: `GET /api/workspaces/:id/token`, `POST /api/workspaces/:id/token/rotate`
- [x] `emitTaskCreated` called on task submit — socket fires to workspace room
- [x] Webhook still fires as fallback (ngrok/router still supported for existing setups)
- [x] Agent-facing REST routes under `/api/agent/` using `x-workspace-token` header

### ✅ Phase 2 — `agentinbox-mcp` npm package
> Completed May 2026

- [x] Package scaffolded at `packages/mcp/`
- [x] Socket connect with workspace token auth (auto-reconnect)
- [x] All 7 MCP tools exposed: `get_pending_tasks`, `get_task`, `get_file`, `update_task_status`, `complete_task`, `escalate_task`, `propose_plan`
- [x] Calls `/api/agent/*` routes using `x-workspace-token` — no JWT needed
- [x] Builds clean with TypeScript
- [x] `complete_task` screenshot_base64 param fixed (was routing to wrong param)
- [x] Express JSON body limit raised to 10mb (screenshots are ~100kb base64)
- [x] Full end-to-end tested on Render: submit → image read → Playwright screenshot → complete with proof
- [ ] **Publish to npm as `agentinbox-mcp`** ← still pending

**Client setup after publish:**
```json
{
  "mcpServers": {
    "agentinbox": {
      "command": "npx",
      "args": ["-y", "agentinbox-mcp"],
      "env": { "AGENTINBOX_TOKEN": "wt_xxx" }
    }
  }
}
```

### 🔴 Phase 3 — Stripe Billing
> Gate by plan, collect money. `BILLING_ENABLED=false` until this is done.

- [ ] Stripe Checkout integration
- [ ] Webhook: `checkout.session.completed` → set plan
- [ ] Webhook: `customer.subscription.deleted` → downgrade
- [ ] Token revocation on non-payment (with grace period)
- [ ] Upgrade banner in PM dashboard when task limit hit
- [ ] Usage visible per workspace in dashboard

**Done when:** New signup gets Starter, hits 2 project limit, upgrades to Growth via Stripe.

### 🔴 Phase 3b — PM Dashboard Socket Notifications
> PM needs live updates without refreshing. Sound alert so they notice completed tasks.

- [x] Server already emits `task.created` to agent socket room
- [ ] Add `task.done`, `task.escalated`, `task.approved` events from server → **PM socket room**
- [ ] PM dashboard connects to socket using JWT (existing auth)
- [ ] Toast notification on `task.done` with sound (Web Audio API — no dependency needed)
- [ ] Toast notification on `task.escalated` (different sound/color)
- [ ] Browser tab title badge: `(3) AgentInbox` when unread tasks exist
- [ ] Notifications auto-dismissed after 5 seconds

**Done when:** PM gets a sound alert the moment Claude completes a task, without refreshing.

### Phase 4 — Screenshot Storage (R2)
> Required before scaling. Currently storing base64 in DB which is inefficient.

- [ ] Cloudflare R2 bucket
- [ ] Screenshots upload to R2 on `complete_task`
- [ ] Signed URLs served to PM dashboard
- [ ] Old screenshots auto-expire after 90 days

### Phase 5 — Self-Serve Onboarding
> Remove manual token issuance.

- [ ] Signup → select plan → Stripe → token issued → copy MCP config snippet
- [ ] Token management page (rotate, revoke, view last connected)
- [ ] Workspace settings (name, members, plan)

### Phase 6 — Enterprise Features
> Once we have 5+ paying Growth/Pro customers.

- [ ] SSO (Google/Microsoft)
- [ ] Audit log export (CSV)
- [ ] Custom data residency option
- [ ] SLA documentation
- [ ] Onboarding service ($500-2000 one-time)

---

## What to Build First (Today)

**Do not build billing before you have 3 paying customers.**

The right sequence:
1. Build the socket server + `agentinbox-mcp` package (Phase 1 + 2)
2. Onboard 2-3 pilot orgs manually — issue tokens by hand, no billing system yet
3. Watch what breaks, what they actually need
4. Then add Stripe (Phase 3)

Manual token issuance takes 2 minutes per client. Don't over-engineer before you have revenue.

---

## The Pitch (one paragraph)

> Your PM, QA, or client submits a bug through a simple web form — no account needed, no technical knowledge required. Your Claude agent picks it up, fixes it in your codebase, and posts a screenshot back to the dashboard as proof. Your PM sees it done without ever talking to a developer. Setup is 8 lines in your Claude config. You bring your own Claude key — we just connect the pipe.

---

## Current Status (May 2026)

- Hosted on Render: `https://useagentinbox.com`
- Turso DB: persistent, survives redeploys
- Auth: email + password, JWT sessions
- MBL Bank pilot: connected via `agentinbox-mcp` (socket, no ngrok needed)
- All MCP tools working end-to-end including file upload + screenshot proof
- Custom fields, file upload, approval gate, Playwright screenshots all working
- Gmail integration archived — replaced by AgentInbox native flow
- `BILLING_ENABLED=false` → all signups get Pro plan during testing week
- Next: PM socket notifications with sound, then Stripe
