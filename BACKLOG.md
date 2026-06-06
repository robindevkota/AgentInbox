# AgentInbox — Backlog

---

## ✅ Done

- Wake-on-task via standalone agentinbox-worker.js — no polling, zero idle tokens, no VS Code needed
- Worker runs silently on PC boot via agentinbox-start.vbs (Windows) / agentinbox-start.sh (Mac)
- Setup prompt writes worker.js + startup scripts automatically (one paste into Claude)
- PM dashboard — task list, detail panel, approval controls
- Submission form — file upload, custom fields
- Approval gate — per project, Claude proposes before touching code
- Telegram per-workspace — every developer connects their own bot via UI
- Telegram as task source — message bot from phone → Claude wakes
- Bidirectional Telegram — approve/reject/answer mid-task via reply
- Playground — animation + chat live demos (best conversion tool)
- agentinbox-mcp published on npm (v0.1.5) — MCP tools for Claude during task processing
- Auth — JWT login/signup, workspace management
- Per-workspace billing columns (plan, task_count_this_month)
- End-to-end pipe verified on MBL project (real task, real Telegram ✅)
- Task type selector on submission form — Bug / Feature / Other prepends [TYPE] to description
- Telegram shows ✨ New feature / 🐛 New bug / 💬 New request based on task type
- Approval wake fix — PM clicking Approve now emits WebSocket, Claude resumes immediately

---

## ✅ Pre-launch testing — PASSED (Jun 5, 2026)

### 1. Simulation test — PASSED 4/4 stacks
Script: `simulate-pipe.js`

| Stack | Task | Result |
|---|---|---|
| React | Fix typo in App.jsx | ✅ done in ~90s |
| Node API | Add /health endpoint | ✅ done in ~90s |
| Python | Fix PAGE_TITLE typo | ✅ done in ~90s |
| Laravel-style | Fix typo in HomeController.php | ✅ done in ~90s |

What was validated:
- [x] Pipe works end-to-end (submit → wake → complete → proof)
- [x] Wake-on-task fires reliably via worker + .mcp.json
- [x] PM dashboard shows correct results per project
- [x] Projects auto-created and cleaned up, zero manual steps

---

### 2. Messy codebase stress test — PASSED 5/5 scenarios
Script: `simulate-messy.js`

| Scenario | Structure | Task | Result |
|---|---|---|---|
| Monorepo | packages/frontend + backend + shared | Fix price arg in App.jsx | ✅ |
| Legacy mess | src/old-stuff, utils-v1, utils-v2, random scripts | Fix formatMoney in utils-v2 | ✅ |
| No docs | Raw code, no README, no comments | Fix ReferenceError typo | ✅ |
| Mixed stack | React + Python + Node in one repo | Fix decrement bug in App.jsx | ✅ |
| Huge codebase | 345 files | Fix BASE_URL typo in src/core/config.js | ✅ |

Claude navigated all structures correctly. Average fix time: 60–90s per task.

**Both tests passed → 100% confident → production ready.**

---

### 3. Complex multi-file bug test — PASSED 5/5 scenarios (Jun 5, 2026)
Script: `simulate-complex.js`

Real production-level codebases. Bugs hidden across connected files. Tasks described like real user reports — no hint of which file.

| Scenario | Bug | Files involved | Result |
|---|---|---|---|
| auth | Login fails for users with uppercase email — case-sensitive lookup in repository | routes → controller → service → userRepository.js | ✅ |
| pricing | Checkout total wrong — tax applied twice across two files | routes → checkoutService.js → pricing.js | ✅ |
| api | Product images null — field named `photo_url` in DB, code reads `image_url` | routes → controller → service → productRepository.js | ✅ |
| config | DB drops under load — `connectTimeoutMS: 5` (ms not seconds) buried in config | app.js → config/index.js → db/connection.js | ✅ |
| middleware | All auth routes return 403 — authMiddleware registered after routes in app.js | app.js middleware order across 5 route files | ✅ |

Claude traced full call chains with no hints. Plain-English summaries good enough for non-technical PMs.

**Verdict: Claude handles real production bugs, not just typos. Ship it.**

---

### 4. Manual end-to-end test — Real developer onboarding flow (Jun 6, 2026)

Full simulation of a new developer signing up and using AgentInbox for the first time.
Stack: Python/Flask. Project: `d:\test-flask-app\` with bugs hidden across 6 files.

#### Developer onboarding (UI flow)
| Step | Result |
|---|---|
| Fresh signup (testdev.flask.001@gmail.com) | ✅ |
| Create project "Flask Bug Tracker" | ✅ |
| Add custom fields: Severity (dropdown, required), Module (dropdown, required) | ✅ |
| Configure Telegram bot + default project | ✅ |
| Enable Screenshot verification toggle | ✅ |
| Download setup file → token pre-filled, all 11 steps correct | ✅ |
| Worker installed + connected (`[worker] Connected to AgentInbox`) | ✅ |

#### Bug submission via UI form
| Step | Result |
|---|---|
| Submit form: title, description, priority, custom fields filled | ✅ |
| Task appears in PM dashboard with correct custom fields (critical, auth) | ✅ |
| Worker receives `task.created` → spawns Claude instantly | ✅ |
| Claude traces bugs across 4 files (auth.py, models/user.py, payments.py, utils/payments.py) | ✅ |
| Both bugs fixed: email case-sensitivity + double tax | ✅ |
| Flask app started → Playwright screenshot taken → attached to task | ✅ |
| PM dashboard shows: done + technical summary + plain summary + screenshot card | ✅ |

#### Bug submission via Telegram (bidirectional)
| Step | Result |
|---|---|
| Message sent to Telegram bot | ✅ |
| Bot replies "⚡ Task created — Claude is on it" instantly | ✅ |
| Task appears in PM dashboard as `Developer (Telegram)` source | ✅ |
| Claude fixes bugs, attaches screenshot proof | ✅ |
| Telegram receives "✅ Fixed — Proof posted to dashboard" | ✅ |

**Note:** One Telegram bot shared across two workspaces caused both workers to race (MBL + Flask). Real developers use one bot per workspace — no conflict. Expected behavior.

**Setup file accuracy:** All 11 steps verified correct. pnpm/yarn install alternatives added.

**Verdict: Full developer journey works end-to-end. Ready to onboard real customers.**

---

## 🟡 After testing passes

### 2. Stripe billing
The only thing blocking revenue.

- `POST /api/billing/checkout` → Stripe Checkout session
- Webhook: `checkout.session.completed` → set workspace plan + plan_expires_at
- Webhook: `customer.subscription.deleted` → downgrade to free
- Flip `BILLING_ENABLED=true` after testing

Already built: plan column, FREE_TASK_LIMIT=50, upgrade banner in UI, BILLING_ENABLED toggle.

**Effort:** 2 days

### 3. Show HN / launch post
After Stripe is live and simulation test passes.

- Title: "AgentInbox — clients submit bugs, your Claude fixes them while you sleep"
- Angles: no API cost (Claude Pro you already pay for), zero idle tokens, one-paste setup
- Post: Hacker News, r/ClaudeAI, r/SideProject

---

## 🟡 First paying customers

### 4. Slack webhook
When task done → POST to developer's Slack channel.
Sticky feature — makes AgentInbox hard to cancel.
**Effort:** 1 day

### 5. Email notifications
Fallback when Telegram not configured. Task submitted/done/escalated → email.
**Effort:** 4 hours

### 6. SLA/stats dashboard
Average fix time, completion rate, escalation % per workspace.
The number a VP needs to justify renewing the subscription.
**Effort:** 2 hours

---

## 🟢 After first 3 paying customers

### 7. PDF weekly report
Every Monday → PDF per workspace → tasks fixed, avg fix time, time saved.
PM emails it to client. Subscription becomes unkillable.
**Effort:** 1 day

### 8. Multi-project submission form
One link, client picks project from dropdown.
Agencies need this to manage 5+ client projects.
**Effort:** 1 day

### 9. Task audit timeline
Every action Claude took, timestamped. Kills the black-box objection.
`picked_up → question_asked → reply_received → completed`
**Effort:** 1 day

### 10. Project type templates
Pick a type (bug fixing / customer support / content / code gen) → get a starter CLAUDE.local.md.
Removes the "what do I write in CLAUDE.local.md?" friction.
**Effort:** 1 day

---

## 🔵 Future — 10+ paying customers

### 11. Standalone agentinbox-worker binary
Current worker requires Node.js + socket.io-client in every project — friction for non-Node stacks (Laravel, Python, etc.).
Publish a single binary (`agentinbox-worker --token wt_xxx --project /path/to/project`) via:
- Windows: `.exe` download or `winget install agentinbox`
- Mac: `brew install agentinbox`
No Node, no npm, no project file. Works on any stack. Auto-starts on boot via the installer.
**Effort:** 3-4 days (Go or Rust binary + packaging)

### 12. Third-party integrations
GitLab, Jira, Linear MCPs already exist — document as supported pattern.
Build native integration only if 3+ customers request same platform.

### 12. Use case expansion
- Customer support chat (live chat mode)
- Scheduled reports (cron submits task every Monday)
- On-demand code review (submit PR link → Claude reviews)
- Data analysis ("why did sales drop?")

---

## Domain
- useagentinbox.com — purchased Jun 2, 2026, expires Jun 2, 2027
- Hosted on Render, DNS on Cloudflare
