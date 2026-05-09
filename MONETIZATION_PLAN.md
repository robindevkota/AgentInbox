# AgentInbox — Monetization Plan

## The Model (Open-Core SaaS)

Open source the router + MCP server. Charge for the hosted service.

```
Free tier  → 1 project, 50 tasks/month
Paid tier  → $15/month → unlimited projects + tasks + team members
```

Developers find it on GitHub → try the hosted version → hit limits → upgrade.

---

## What's Already Built ✅

- MCP server with all 7 tools
- PM dashboard (workspace, projects, tasks, audit log, approval gate)
- Client submission form
- Webhook system
- File uploads
- Slack + email notifications
- Claude Loop router (the killer feature)
- SQLite/Turso database
- Docker support
- Hosted on Render

**~80% of v1 is done. Only the commercial layer is missing.**

---

## What Needs to Be Built

### Phase 1 — Auth System (Week 1)
> Without this, you can't have multiple paying customers on one hosted instance.

**New DB tables needed:**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Link workspace to a user (owner)
ALTER TABLE workspaces ADD COLUMN owner_id TEXT REFERENCES users(id);
ALTER TABLE workspaces ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE workspaces ADD COLUMN task_count_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN plan_expires_at INTEGER;
```

**New API routes needed:**
```
POST /auth/signup     → email + password → create user + workspace → return session token
POST /auth/login      → email + password → return session token
POST /auth/logout     → clear session
GET  /auth/me         → return current user + workspace + plan
```

**Session:** Simple JWT stored in localStorage on the frontend. No cookies needed.

**How it works:**
- Developer signs up → auto-creates their workspace → gets their workspace ID
- All existing PM dashboard routes get a `requireAuth` middleware instead of `requireApiKey`
- Each user only sees their own workspaces/projects/tasks

**Files to create/edit:**
- `packages/server/src/auth/users.ts` — signup, login, JWT issue/verify
- `packages/server/src/auth/middleware.ts` — `requireAuth` middleware
- `packages/server/src/queue/db.ts` — add users table + workspace columns
- `packages/server/src/api/routes.ts` — add `/auth/*` routes, swap `requireApiKey` → `requireAuth`
- `packages/ui/src/auth/` — Login.tsx + Signup.tsx pages
- `packages/ui/src/main.tsx` — add auth routes, redirect to login if no session

**Keep it simple:**
- No OAuth for now — just email + password
- bcrypt for password hashing (already in Node ecosystem)
- JWT with 30-day expiry — no refresh tokens needed yet
- No email verification on signup — frictionless, add later

---

### Phase 2 — Usage Limits (Week 1, after auth)
> Gate the free tier so there's a reason to upgrade.

**Logic (server-side):**
```
On task create:
  1. Get workspace plan
  2. If plan === 'free' AND task_count_this_month >= 50 → return 403 "Upgrade to continue"
  3. Else → create task, increment task_count_this_month
```

**Reset monthly count:** Cron job or just check `created_at` of tasks in current month.

**Files to edit:**
- `packages/server/src/api/routes.ts` — add limit check before task creation
- `packages/server/src/queue/tasks.ts` — add `getMonthlyTaskCount(workspaceId)` query

---

### Phase 3 — Billing with Stripe (Week 2)
> The actual money part.

**Flow:**
```
User on free plan hits limit
         ↓
PM dashboard shows upgrade banner
         ↓
Click "Upgrade" → Stripe Checkout (hosted page, no card UI to build)
         ↓
Stripe redirects back → webhook hits /stripe/webhook
         ↓
Server sets workspace.plan = 'paid', plan_expires_at = now + 30 days
         ↓
User is on paid plan, limits removed
```

**What to build:**
- Stripe account + product ($15/month subscription)
- `POST /stripe/create-checkout` → returns Stripe checkout URL
- `POST /stripe/webhook` → handles `checkout.session.completed` + `customer.subscription.deleted`
- Upgrade banner in PM dashboard when approaching/hitting limit
- Plan badge in PM dashboard header (Free / Pro)

**Files to create/edit:**
- `packages/server/src/billing/stripe.ts` — checkout + webhook handler
- `packages/server/src/api/routes.ts` — add `/stripe/*` routes
- `packages/ui/src/pm/PmDashboard.tsx` — add upgrade banner + plan badge

---

## UI Changes Needed

### New pages (packages/ui/src/)
```
auth/
  Login.tsx      — email + password form, link to signup
  Signup.tsx     — email + password form, auto-creates workspace
```

### Changes to existing UI
- `PmDashboard.tsx` — add plan badge in header, upgrade banner when at limit
- `main.tsx` — add `/login` and `/signup` routes, auth guard on `/pm`

### Login page design (keep it simple)
```
┌─────────────────────────────┐
│         AgentInbox          │
│                             │
│  Email                      │
│  [____________________]     │
│                             │
│  Password                   │
│  [____________________]     │
│                             │
│  [      Sign In      ]      │
│                             │
│  Don't have an account?     │
│  Sign up                    │
└─────────────────────────────┘
```

---

## Pricing

| | Free | Pro |
|---|---|---|
| Projects | 1 | Unlimited |
| Tasks/month | 50 | Unlimited |
| Team members | 1 | Unlimited |
| File uploads | ✓ | ✓ |
| Slack notifications | ✗ | ✓ |
| Email notifications | ✗ | ✓ |
| Support | GitHub issues | Email |
| Price | $0 | $15/month |

---

## Build Order

```
Week 1, Day 1-3:  Auth system (users table + signup/login API + Login/Signup UI)
Week 1, Day 4-5:  Swap requireApiKey → requireAuth on all PM routes
Week 1, Day 5:    Usage limits (50 tasks/month on free)
Week 2, Day 1-3:  Stripe checkout + webhook
Week 2, Day 4:    Upgrade banner in PM dashboard
Week 2, Day 5:    Test end-to-end, deploy to Render
```

**Total: ~2 weeks to a chargeable product.**

---

## Deployment Changes for Render

Add these env vars to Render:
```
JWT_SECRET=<random 64 char string>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

Remove `SEED_WORKSPACE_*` vars — workspaces are now created via signup, not env seeding.

---

## What stays open source

- `examples/claude-loop/claude-router.js` — the router, always free
- `packages/server/` — the MCP server + API, always free to self-host
- `packages/ui/` — the dashboard UI, always free to self-host

**Self-hosters get everything for free.** The hosted version charges for convenience.
