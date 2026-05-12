# AgentInbox — Monetization Plan

## The Model (Open-Core SaaS)

Open source the router + MCP server. Charge for the hosted service.

```
Free tier  → 1 project, 50 tasks/month
Pro tier   → $15/month → unlimited projects + tasks
```

Developers find it on GitHub → try the hosted version → hit limits → upgrade.

---

## What's Built ✅ (May 2026)

### Infrastructure
- [x] Hosted on Render.com — `https://agentinbox-k2vf.onrender.com`
- [x] Turso (libsql) persistent database — data survives all Render restarts/redeploys
- [x] Auth system — email + password signup/login, JWT sessions (30-day expiry)
- [x] Multi-tenant — each developer has isolated workspace + projects
- [x] ngrok static tunnel support for webhook delivery

### Core Features
- [x] MCP server with 7 tools (`get_pending_tasks`, `get_task`, `update_task_status`, `complete_task`, `get_file`, `escalate_task`, `propose_plan`)
- [x] PM dashboard (workspace, projects, tasks, audit log, approval gate)
- [x] Client submission form (no account needed, mobile-friendly)
- [x] Webhook system (fires to local claude-router on task submit)
- [x] File uploads (PDF, Word, images, text — up to 20MB, parsed and passed to Claude)
- [x] Slack + email notifications
- [x] Claude Loop router (the killer feature — auto-triggers Claude CLI on task arrive)
- [x] White-label branding (brand name, color, logo per project)
- [x] Custom fields per project (dropdown + text — Environment, Module, Steps, Case ID, etc.)
- [x] Task comments
- [x] Task priority (Low/Medium/High)
- [x] PR link in completion summary
- [x] Playwright screenshot on complete
- [x] Approval gate (PM approves Claude's proposed plan before execution)
- [x] Docker support
- [x] Free tier limit enforcement (50 tasks/month)
- [x] Plan badge in PM dashboard header (Free / Pro)

### Auth System (Phase 1) ✅
- [x] `POST /auth/signup` — email + password → create user + workspace → JWT
- [x] `POST /auth/login` — email + password → JWT
- [x] `GET /auth/me` — current user + workspace + plan
- [x] `POST /auth/reset-password` — admin password reset endpoint
- [x] `requireAuth` middleware on all PM routes
- [x] Login + Signup pages in UI

### Usage Limits (Phase 2) ✅
- [x] Free tier: 50 tasks/month per workspace
- [x] Task count tracked per workspace per billing month
- [x] 403 returned when free limit exceeded
- [x] Usage stats visible in PM dashboard

---

## What Still Needs to Be Built

### Phase 3 — Stripe Billing
> The actual money part.

**Flow:**
```
User on free plan hits 50-task limit
         ↓
PM dashboard shows upgrade banner
         ↓
Click "Upgrade" → Stripe Checkout (hosted page)
         ↓
Stripe redirects back → webhook hits /stripe/webhook
         ↓
Server sets workspace.plan = 'pro', plan_expires_at = now + 30 days
         ↓
User is on Pro plan, limits removed
```

**What to build:**
- Stripe account + product ($15/month subscription)
- `POST /stripe/create-checkout` → returns Stripe checkout URL
- `POST /stripe/webhook` → handles `checkout.session.completed` + `customer.subscription.deleted`
- Upgrade banner in PM dashboard when approaching/at limit

**Render env vars to add:**
```
JWT_SECRET=<random 64 char string>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

---

## Pricing

| | Free | Pro |
|---|---|---|
| Projects | 1 | Unlimited |
| Tasks/month | 50 | Unlimited |
| Team members | 1 | Unlimited |
| File uploads | ✓ | ✓ |
| Custom fields | ✓ | ✓ |
| Slack notifications | ✗ | ✓ |
| Email notifications | ✗ | ✓ |
| White-label branding | ✗ | ✓ |
| Support | GitHub issues | Email |
| Price | $0 | $15/month |

---

## What stays open source

- `examples/claude-loop/claude-router.js` — the router, always free
- `packages/server/` — the MCP server + API, always free to self-host
- `packages/ui/` — the dashboard UI, always free to self-host

**Self-hosters get everything for free.** The hosted version charges for convenience.

---

## Live URLs

| | URL |
|---|---|
| Hosted PM dashboard | https://agentinbox-k2vf.onrender.com/pm |
| Signup | https://agentinbox-k2vf.onrender.com/signup |
| MCP endpoint | https://agentinbox-k2vf.onrender.com/mcp |
