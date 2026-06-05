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

---

## 🔴 Now — Pre-launch testing

### 1. Simulation test — automated, not manual
**Goal:** Verify the full pipe works across different stacks before inviting real users.

**Approach — one script, not 20 manual setups:**

Build a simulation script that acts as the "new developer" automatically:
- Creates a temp folder with realistic project structure (React / Laravel / Node / Python)
- Writes agentinbox-worker.js, agentinbox-start.bat, installs socket.io-client into it
- Submits a test task via API to that project's token
- Runs `node agentinbox-worker.js` in that folder (simulating PC startup)
- Waits for task.created WebSocket event → worker spawns `claude --print "check pending tasks..."`
- Waits for task to complete
- Checks PM dashboard shows done
- Checks Telegram notification arrived
- Reports pass/fail

Run once per stack type (4-5 runs total). No manual VS Code setup. No fake accounts.

**What this validates:**
- [ ] Pipe works end-to-end (submit → wake → complete → proof)
- [ ] Claude writes accurate rules for different stacks
- [ ] Wake-on-task fires reliably via worker (not .mcp.json)
- [ ] PM dashboard shows correct results per project
- [ ] Telegram notifications arrive on completion

**Token structure:**
- Workspace token `wt_...` — one per developer, goes in worker.js env, accesses all projects
- Project token — one per project, goes in submission link URL, shared with clients only

**Pass criteria:** all 4-5 stack simulations complete with proof in PM dashboard. Zero manual steps.

---

### 2. Messy codebase stress test (after simulation passes)
**Goal:** Confirm Claude handles real-world messy projects before production. Simulation uses clean fake projects — real codebases are never clean.

**Test projects to create manually:**

| Test | Structure | What it validates |
|---|---|---|
| Monorepo | packages/frontend + packages/backend + packages/shared | Claude figures out multi-package structure, writes rules for each |
| Legacy mess | src/old-stuff, src/new-stuff, utils-v1, utils-v2, random scripts | Claude makes sense of chaotic folder structure |
| No docs | Raw code, no README, no comments | Claude writes useful rules with zero context |
| Mixed stack | React + Laravel + Python scripts in one repo | Claude handles multiple languages |
| Huge codebase | 500+ files | Claude scans without hitting context limits |

**What you're testing:** does the setup prompt produce accurate CLAUDE.local.md and rules for each? Does Claude fix tasks correctly given those rules?

**If Claude fails** — fix is in the setup prompt, not the architecture. Pipe stays the same.

**Real tasks to test (not fake):**

| Difficulty | Task |
|---|---|
| Simple | "Button text says 'Sbumit' — fix the typo" |
| Simple | "Change the page title from Hello to Hello World" |
| Logic bug | "Login fails when email has uppercase letters" |
| UI feature | "Add a loading spinner to the form submit button" |
| API feature | "Add a /health endpoint that returns 200 OK" |
| Refactor | "Move auth logic from index.js into its own auth.js file" |

Start simple (typos, small bugs) → move to logic bugs → then features. Each submitted via the form with developer away from desk.

**Pass criteria:**
- Claude fixes the bug correctly without developer intervention
- Fix is in the right file, right line
- Screenshot proof posted to PM dashboard
- Developer reviews result — would they accept this in a real project?

**After both Test 1 + Test 2 pass → 100% confident → production ready.**

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
