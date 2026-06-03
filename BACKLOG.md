# AgentInbox — Master Backlog

---

## ✅ Event-driven Claude trigger — DONE (replaces Task Scheduler + polling)

**Problem solved:** Idle polling wastes Claude Pro tokens. If only 5 tasks/day arrive, Claude was polling every 30s all day burning tokens doing nothing.

**Solution built:**
```
Task submitted
  → Server fires trigger-claude.ps1 (TRIGGER_CLAUDE=true in .env)
  → PowerShell opens Claude Code
  → Claude processes all pending tasks
  → Claude exits when queue is empty
  → Zero token waste, zero idle polling
```

**Files added:**
- `trigger-claude.ps1` — PowerShell script that wakes Claude
- `packages/server/src/trigger/claude.ts` — server-side trigger
- `TRIGGER_CLAUDE=true` env var in packages/server/.env

**Daily workflow now:**
```
1. Open VS Code
2. cd packages/server && node dist/cli.js start
3. Done — Claude auto-wakes on task submission, exits when done
```

---

## ✅ Playground Page — DONE

## 🟣 In Progress — Playground Page

### /playground — Two-tab live demo (Animation + Chat)

**Goal:** Show developers two use cases in one page. No signup needed. Claude processes live.

**Tab 1 — Animation**
- Canvas on left, prompt input on right
- User types "make a particle explosion in blue" → hits Generate
- Terminal appears showing Claude working (SSE polling)
- Canvas renders the animation Claude wrote live

**Tab 2 — Chat Support**
- Fake store context on left (logo, sample products/orders)
- Chat interface on right
- User asks "where is my order?" → Claude reads fake store data → replies
- Shows customer support use case

**Architecture:**
- New route `/playground` in server
- Two AgentInbox projects: `playground-animation` + `playground-chat`
- Two CLAUDE.local.md templates (one per use case)
- SSE polling for live terminal feel (already exists in task stream)
- Canvas renders JS code that Claude returns in `summary_technical`

**Waitlist capture:** email input at bottom of both tabs

**Effort:** ~3 days
**Priority:** #1 — builds the undeniable demo before waitlist/Show HN

---

## ✅ Completed This Session

### Approval Gate + Telegram (bidirectional) — DONE & PUSHED

**What was built:**
- Telegram bot (@AgentInboxAlertBot) — polling every 3s, threaded replies routed to correct task
- Bug submitted → 🐛 Telegram notification
- Fix done → ✅ Telegram notification  
- Escalated → 🚨 Telegram notification
- Approval needed → ⏳ Telegram with plan, long press → Reply to approve/reject
- `ask_developer()` MCP tool — Claude asks question, polls for reply, continues after 5min timeout
- `notify_developer()` MCP tool — one-way ping
- `require_approval` flag now returned in agent task endpoints
- Rejection sets task back to `pending` so Claude revises and re-proposes
- UI fix: approval gate toggle now saves correctly (Content-Type header)
- `CLAUDE.local.md` — autonomous task loop instructions for Claude Code
- `.mcp.json` — local agentinbox-mcp connection config
- Tested end-to-end: bug → propose (green) → reject via Telegram → revise (red) → approve → fix committed ✅

**Credentials saved in memory:** `project-credentials.md`

**To add to Render env vars:**
```
TELEGRAM_BOT_TOKEN=8670075560:AAEr8qxNu3FguetI06xmvofBYpvBz7nRbhU
TELEGRAM_CHAT_ID=6121077387
```

**To run agent locally:**
```
Terminal 1: cd packages/server && node dist/cli.js start
Terminal 2: claude → "Read CLAUDE.local.md and start the autonomous task loop"
```

---

## 🔴 Do First (blocking revenue)

### 1. Turn Cloudflare proxy back to orange
Both `useagentinbox.com` and `www.useagentinbox.com` records need orange cloud (Proxied) in Cloudflare DNS — wait until Render shows Certificate Active (green) first.

### 2. Deploy to Render
Push triggered automatically on git push — verify latest build is live at `https://useagentinbox.com`. Check the animation, setup guide download, and workspace token in Settings all work on the live URL.

### 3. Stripe billing
The only thing blocking revenue. Nothing else matters until this is done.

**What to build:**
- `POST /api/billing/checkout` → Stripe Checkout session
- Webhook: `checkout.session.completed` → set workspace `plan` + `plan_expires_at`
- Webhook: `customer.subscription.deleted` → downgrade to free
- Flip `BILLING_ENABLED=true` in Render env vars after testing

Already built that makes this easy:
- `plan` column on workspaces (`free`, `starter`, `growth`, `pro`)
- `FREE_TASK_LIMIT = 50` enforcement in routes.ts
- Upgrade banner already renders in UI when limit hit
- `BILLING_ENABLED` env var toggle

---

## 🟡 After Stripe (first paying customers)

### 4. Show HN post
- Title: "AgentInbox – clients submit bugs, your Claude Code session fixes them, everyone sees proof"
- Post at: `https://useagentinbox.com`
- Mention: Claude Pro as free API angle, 8-line setup, setup file download
- Also post: r/ClaudeAI, r/SideProject

### 5. Outbound Slack webhook
When a task is done → POST to developer's Slack channel. 1 day build. Makes AgentInbox sticky and hard to cancel.

### 6. SLA/stats dashboard
Average fix time, completion rate, escalation % per workspace. 2 hours of SQL. The renewal justification a VP needs to approve a purchase order.

---

## 🟢 Backlog (after first 3 paying customers)

### ✅ 7. Approval Gate — DONE

**The setting (per project, in Settings):**
```
Require approval before Claude makes code changes
○ Off — Claude works fully autonomously
● On — Claude must get approval before touching any file
```

**The flow when ON:**
```
Bug submitted
  → Claude analyzes the codebase, figures out what needs changing
  → Claude calls propose_plan(id, plan):
      "I'm going to edit schemas/personal-info.json line 42 —
       change the validation regex to allow hyphens.
       Also update __tests__/validation.test.js."
  → Claude STOPS. Does not touch any file yet.

Developer gets notified — two channels:

  1. PM Dashboard (at desk)
     → "⏳ Awaiting approval" badge on task
     → Developer clicks task → sees Claude's full plan
     → Clicks "Approve" or "Reject" with optional reason

  2. Telegram (away from desk)
     → "⏳ Task #42: Claude has a plan ready. Approve?"
     → Developer replies "approve" or "reject: do it in the other file"
     → Claude receives answer and acts

On approval  → Claude makes changes, commits, pushes, completes task
On rejection → Claude reads the reason, revises the plan, proposes again
```

**What to build:**

| Piece | Effort |
|---|---|
| `approval_required` toggle on project Settings page | 1 hour |
| `approval_required` field returned in `get_task()` response | 30 min |
| `POST /api/agent/tasks/:id/approve` endpoint | 2 hours |
| `POST /api/agent/tasks/:id/reject` endpoint (accepts `{ reason }`) | 1 hour |
| PM dashboard — "⏳ Awaiting approval" badge + Approve/Reject buttons | 2 hours |
| Telegram approval flow — "approve"/"reject: reason" reply handling | 1 hour (part of Telegram feature) |
| Claude polls `get_task()` waiting for `approval_status` field | 1 hour (MCP side) |

**Already exists:** `propose_plan()` MCP tool, `task.approval_needed` Socket.io event — both just need wiring.

**Effort:** ~1 day

---

### ✅ 8. Telegram — Two-way mid-task communication — DONE

**Full notification flow:**
```
Bug submitted       → "🐛 New bug: Login crashes on mobile. Claude is on it."
Claude gets stuck   → "❓ Task #42: Should I fix personal-info.json or review.json?"
                       [developer replies to this Telegram message → Claude continues]
Fix done            → "✅ Fixed: Login crashes on mobile. Proof on dashboard."
Escalated           → "🚨 Login crashes on mobile needs you. Claude can't solve it."
```

**Three modes — Claude decides which:**
- **Silent** — Claude finishes without needing input → just posts proof
- **Ask** — Claude calls `ask_developer(question)` → waits 5 min for Telegram reply → if no reply, proceeds with best judgment and logs the decision
- **Escalate** — Claude genuinely can't solve it → calls `escalate_task()` as normal

**What to build:**

1. **New MCP tool: `ask_developer(question, task_id)`**
   - POSTs question to server
   - Server fires Telegram message, stores Telegram message ID against task
   - Claude polls `get_task(id)` every 30s — when `developer_reply` is set, continues
   - Times out after 5 min → Claude proceeds with best judgment, logs "no reply received, proceeding with: [decision]"

2. **New MCP tool: `notify_developer(message, task_id)`**
   - One-way: bug received, fix done, fix pushed — no reply needed

3. **Telegram bot (developer runs once, ~60 lines Node.js)**
   - Developer hits "Reply" to the specific Telegram message → bot reads reply-to message ID → knows which task it belongs to
   - POSTs to AgentInbox: `POST /api/agent/tasks/:id/reply { reply: string }`
   - Developer sets up once: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in `.env`

4. **New API endpoint: `POST /api/agent/tasks/:id/reply`**
   - Accepts `{ reply: string }` with workspace token auth
   - Sets `developer_reply` field on task

**Phase 2 (after Phase 1 works):**
- **Mobile approval** — wire Telegram reply to `propose_plan()` — developer approves/rejects from phone before Claude touches any code

**Effort:** ~3 days (Phase 1), ~1 day (Phase 2)

---

### 9. PDF Weekly Report

**What:** Server generates a PDF every week per workspace — tasks fixed, avg fix time, escalation rate, time saved. PM emails it to their client as proof of value.

**Why it matters:** PM looks like a hero to their client. Subscription becomes unkillable — nobody cancels the thing that generates their weekly proof-of-work report.

**What to build:**
- Cron job: every Monday 9am, generate PDF per workspace
- PDF content: tasks completed, avg fix time, escalation %, time saved estimate
- Email to workspace owner with PDF attached
- Or: "Download weekly report" button in PM dashboard

**Effort:** 1 day

---

### 10. Multi-project Submission Form

**What:** One submission link, client picks which project from a dropdown. Currently each project has its own separate link.

**Why it matters:** Agencies managing 5+ client projects can't hand out 5 separate links. Without this, agencies won't upgrade to Growth/Pro.

**What to build:**
- New route: `GET /submit/workspace/:workspaceId` — shows all projects in a dropdown
- Client picks project, fills form, submits — routes to correct project
- Existing per-project links still work (don't break them)

**Effort:** 1 day

---

### 11. Task Replay / Audit Log

**What:** Every action Claude took on a task, timestamped in a visible timeline on the task detail page.

```
2:14pm — Claude picked up the task
2:18pm — Claude asked developer: "Which file should I fix?"
2:21pm — Developer replied: "personal-info.json"
2:31pm — Claude completed. Screenshot posted.
```

**Why it matters:** Kills the black-box objection. Full transparency on every decision, every pause, every developer interaction. Trust builder that closes enterprise deals.

**What to build:**
- `task_events` table: `task_id`, `event_type`, `message`, `timestamp`
- MCP tools write events automatically (task picked up, question asked, reply received, completed, escalated)
- Task detail page in PM dashboard shows the timeline
- Event types: `picked_up`, `question_asked`, `reply_received`, `plan_proposed`, `plan_approved`, `completed`, `escalated`

**Effort:** 1 day

---

### 12. Third-party Integrations (Jira / GitLab / Linear)

GitLab MCP, Jira MCP, Linear MCP already exist. Claude can use them alongside `agentinbox-mcp` in the same session — no extra engineering needed. Document this as a supported pattern, don't build it. Only build a native integration if 3+ customers specifically request one platform.

**Effort:** 0 (documentation) or 1-2 weeks per native integration

---

## 🔵 Future — After 10+ paying customers

### 13. Project Type Templates — Auto-generated CLAUDE.md

**The problem:** Every use case needs a different CLAUDE.md. Developer has to know what to write. That's friction that kills adoption.

**The solution:** When developer creates a project, they pick a type. AgentInbox generates a starter CLAUDE.md for them.

```
What does this project do?
○ Bug fixing         → CLAUDE.md with code fix rules + git push instructions
○ Customer support   → CLAUDE.md with DB query rules + conversational reply format
○ Content generation → CLAUDE.md with brand voice + output format rules
○ Animation/code gen → CLAUDE.md with canvas output + streaming rules
```

Developer downloads the generated file, drops it in their project root, fills in DB credentials and codebase path. Done.

**What to build:**
- Project type selector on project creation screen
- 4 starter CLAUDE.md templates
- "Download setup file" bundles `.mcp.json` + `CLAUDE.md` together as a zip

**Effort:** 1 day

---

### 14. Use Case Expansion — Future Project Types

AgentInbox is a pipe. Same infrastructure, any human → Claude → output workflow.

**14a. Customer Support Chat**
- Customer submits question via chat UI instead of bug form
- Claude has DB access, looks up orders, accounts, status
- Replies conversationally, escalates to human when stuck
- Settings toggle per project: Bug report vs Live chat mode

**14b. Live Animation / Code Generation**
- User describes animation ("blue particle explosion")
- Claude writes canvas/Three.js/GSAP code
- Code streamed back via SSE → frontend injects into canvas → renders live
- User watches animation appear in real time as Claude builds it

**14c. Content Generation**
- Marketing team submits "write a blog post about X"
- Claude writes with brand voice rules from CLAUDE.md
- Posts result back as markdown or HTML

**14d. Data Analysis / Reporting**
- "Why did sales drop last week?"
- Claude queries DB, runs analysis, writes summary
- Scheduled reports: cron submits task every Monday, Claude runs it

**14e. On-demand Code Review**
- Dev submits PR link or pastes diff
- Claude reviews for bugs, security issues, style
- Posts findings back as structured comments

**The pattern across all:**
```
Any human + any request
  → AgentInbox form (customized per use case)
  → Claude with right CLAUDE.md + relevant access
  → Result pushed back to whoever asked
```

---

## Domain

- `useagentinbox.com` — purchased Jun 2, 2026, expires Jun 2, 2027
- Hosted on Render, DNS on Cloudflare
- Both records currently DNS only (grey) — turn orange after certs go green

---

## Priority rule

Stripe first. Nothing else until revenue exists. Manual token issuance works for the first 5 customers.
