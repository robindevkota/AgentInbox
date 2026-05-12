# AgentInbox

> Your clients submit bugs. Claude fixes them. Everyone sees what happened.

AgentInbox is an open-source task inbox that connects non-technical clients directly to a Claude agent. Clients submit bugs and feature requests through a simple web form — with optional file/screenshot attachment. Claude picks them up, fixes them in your real codebase, uploads the change, takes a screenshot of the live result, and writes back a plain-English summary. No PM in the middle, no WhatsApp chains, no lost context.

**Uses Claude Pro via CLI — no API key, no extra billing.**

---

## How it works

```
Client submits bug (+ optional screenshot/PDF)
              ↓
Task lands in AgentInbox  (status: pending)
              ↓
Webhook fires → claude-router.js on your machine
              ↓
Claude reads your codebase rules (CLAUDE.md / agentinbox.md)
              ↓
Claude fixes the bug, uploads, takes a Playwright screenshot
              ↓
PM dashboard shows: Done ✓  with technical + plain summaries
                            + submitted image + Claude's screenshot
```

**Everything persists.** Tasks, summaries, uploaded images, and Claude's screenshots are all stored in Turso (cloud SQLite) — survives server restarts and redeploys forever.

---

## Real-world use cases

### 1. Form schema / no-code platform bugs
A client notices a field label is wrong on a production form. They open the submission link, describe the issue, and attach a screenshot. Claude reads the JSON schema, makes the label change, uploads it to the API, navigates to the live URL, takes a screenshot proving the fix, and marks the task done — all without a developer touching anything.

**What you set up:** CLAUDE.md rules describing your schema structure + upload command. Claude follows them exactly.

### 2. Multi-environment projects (UAT + Prod)
Configure two projects in `projects.json` pointing to the same codebase directory but with different tokens. Clients/QA use the UAT token, internal PMs use the Prod token. Claude reads `custom_field_values.environment` and decides which environment to target.

### 3. Approval-gated deployments
Enable **Require Approval** on a project. Claude proposes a fix plan — you approve or reject from the PM dashboard before any code runs. Useful for production projects where you want a human in the loop.

### 4. QA/testing pipelines
QA engineers submit test failures with screenshots. Claude reads the screenshot via `get_file()`, identifies the regression, fixes it, and replies with a Playwright screenshot of the passing state.

### 5. Client-facing bug intake for agencies
Give each client their own project token and submission link. All bugs flow into one PM dashboard. Claude fixes them autonomously in the background. Clients see live status updates at `/task/<id>` without needing an account.

### 6. Rule-driven autonomous agents
Write `.claude/rules/` files per topic (schema fields, widget logic, validation, etc.). In `CLAUDE.local.md`, tell Claude which rule file to read before touching each area. Claude follows your conventions exactly — no hallucinated patterns.

---

## What persists

| Data | Where stored | Survives redeploy? |
|------|-------------|-------------------|
| Tasks, statuses, summaries | Turso (cloud SQLite) | Yes |
| Uploaded images/PDFs | Base64 in Turso DB | Yes |
| Claude's completion screenshots | Base64 in Turso DB | Yes |
| User accounts, workspaces | Turso | Yes |
| Audit log | Turso | Yes |
| Your codebase changes | Git | Yes (committed by Claude) |

> **Note:** File uploads are stored as base64 in the database — not on disk — so they survive Render redeploys and server restarts without any object storage setup.

---

## Hosted quickstart

### 1. Sign up

Go to [agentinbox-k2vf.onrender.com/signup](https://agentinbox-k2vf.onrender.com/signup) → your workspace and first project are created automatically.

### 2. Get your project token

PM dashboard → click your project → copy the **Client link** token from the top bar.

### 3. Set up the local router

```bash
git clone https://github.com/robindevkota/AgentInbox
cd AgentInbox/examples/claude-loop
cp projects.example.json projects.json
```

Edit `projects.json`:

```json
[
  {
    "token": "your-project-token-here",
    "dir": "C:\\Users\\you\\your-project",
    "name": "My Project"
  }
]
```

Multiple projects pointing to the same or different directories are supported.

### 4. Write your context file

**Option A — `scripts/agentinbox.md`** (simple, checked in):

```markdown
You are an autonomous agent. Follow these steps exactly:

1. Call get_pending_tasks() — get all pending tasks
2. For each task:
   - update_task_status(id, "in_progress")
   - get_task(id) to read full details
   - If has_file is true, call get_file(task_id) to see the attachment
   - Fix the issue in the codebase
   - complete_task(id, summary_technical, summary_plain)
3. If you cannot solve a task, call escalate_task(id, reason)
4. Process ALL pending tasks before stopping

Stack: [describe your stack]
Key files: [e.g. src/components/, schemas/]
Rules: [any conventions Claude must follow]
```

**Option B — `CLAUDE.local.md`** (gitignored, for sensitive/personal config):

Use this for environment-specific details, personal shortcuts, or production credentials. Claude reads it automatically when triggered from that directory. This is the recommended approach for rule-heavy projects — see the Rules pattern below.

### 5. Start the router and tunnel

```bash
# Terminal 1 — router (with 100k output token limit)
node claude-router.js --config projects.json --port 4001

# Terminal 2 — tunnel (use a static domain to avoid updating webhook every restart)
ngrok http --domain=your-static-domain.ngrok-free.app 4001
```

### 6. Connect the webhook

PM dashboard → Settings → **Webhook URL**:
```
https://your-static-domain.ngrok-free.app/webhook
```

**Done.** Share your submission link with clients:
```
https://agentinbox-k2vf.onrender.com/submit/<your-token>
```

---

## The Rules pattern (advanced)

For complex codebases, organise Claude's domain knowledge into topic-specific rule files. This keeps context lean — Claude only loads what's relevant.

**Structure:**
```
.claude/
  rules/
    01-json-schema.md       # field types, dependencies, required
    02-widget-assignment.md # which UI widget maps to which field
    03-validation.md        # custom validation patterns
    04-deployment.md        # how to upload/deploy changes
  CLAUDE.md                 # index — tells Claude which rule to load per topic
CLAUDE.local.md             # gitignored — env tokens, personal shortcuts, AgentInbox config
```

**`CLAUDE.md` (checked in):**
```markdown
## Rule Index
| Topic              | Rule file                    |
|--------------------|------------------------------|
| Schema fields      | .claude/rules/01-json-schema.md |
| Widget assignment  | .claude/rules/02-widget-assignment.md |
| Validation         | .claude/rules/03-validation.md |
| Upload/deploy      | .claude/rules/04-deployment.md |

Read ONLY the relevant rule file before answering. Never load all at once.
```

**`CLAUDE.local.md` (gitignored — AgentInbox config):**
```markdown
## AgentInbox — Autonomous Task Processing

When triggered via AgentInbox, process ALL pending tasks autonomously.

### Rules for autonomous operation
1. Call get_pending_tasks() — get all unstarted tasks
2. For each task:
   - update_task_status(id, "in_progress")
   - get_task(id) to read full details
   - If has_file is true, call get_file(task_id) to see the attachment
   - Read the relevant .claude/rules/ file before touching any schema/component
   - Fix the bug or implement the feature
   - Take a Playwright screenshot of your live site
   - complete_task(id, summary_technical, summary_plain, screenshot_base64=<base64>)
3. If you cannot solve a task, call escalate_task(id, reason)
4. Work through ALL pending tasks before stopping

### Completion summary rules
- summary_technical: file path, what changed, line number (e.g. "Renamed field label in schemas/form.json line 42")
- summary_plain: one sentence, no jargon (e.g. "The account type field now shows the correct label")
```

This pattern means Claude always follows your project conventions — no hallucinated patterns, no guessing.

---

## MCP tools

| Tool | What it does |
|------|-------------|
| `get_pending_tasks()` | Returns all unstarted tasks |
| `get_task(id)` | Full task detail including custom fields and parsed file content |
| `update_task_status(id, status)` | Sets in_progress, failed, blocked |
| `complete_task(id, technical, plain, pr_link?, screenshot_base64?)` | Writes summaries, stores screenshot, marks done |
| `get_file(task_id)` | Returns parsed content of uploaded PDF/image/doc |
| `escalate_task(id, reason)` | Flags for human review |
| `propose_plan(id, plan)` | Proposes a fix plan — PM approves before Claude runs it |

The `screenshot_base64` parameter on `complete_task` accepts a base64-encoded PNG. Pass a Playwright screenshot here and it renders inline in the PM dashboard task detail.

---

## PM Dashboard

Sign in at `/pm` with your credentials.

- All projects and tasks in one view
- Filter by status: pending / awaiting_approval / in_progress / done / failed / escalated
- Click any task to see full detail: submitted image, Claude's screenshot, technical summary, client summary, audit log
- Enable approval gate per project — Claude proposes a plan, you approve before code runs
- Add custom fields per project (Environment, Module, Step, Case ID, etc.)
- Copy client submission links
- Delete tasks

---

## Client submission form

Send your client one link — no account needed:

```
https://agentinbox-k2vf.onrender.com/submit/<project-token>
```

Clients can:
- Describe the bug or feature request
- Attach a screenshot, PDF, or any image
- Set priority
- Fill in custom fields (e.g. Environment, Module)
- Track live status at `/task/<id>`

---

## Self-hosting

**Requires:** Node.js 18+, pnpm

```bash
git clone https://github.com/robindevkota/AgentInbox
cd AgentInbox
pnpm install
pnpm dev
```

Sign up at `http://localhost:3000/signup`. PM dashboard at `http://localhost:3000/pm`.

### Connect Claude via MCP (alternative to router)

```bash
claude mcp add agentinbox --transport http http://localhost:3000/mcp --scope user
```

Claude picks up tasks automatically when you open a session in the project directory.

### Docker

```bash
docker compose up
```

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | SQLite path (ignored when TURSO_URL is set) |
| `TURSO_URL` | _(none)_ | Turso database URL — use for persistent cloud DB |
| `TURSO_AUTH_TOKEN` | _(none)_ | Turso auth token |
| `WEBHOOK_URL` | _(none)_ | Your ngrok/tunnel URL for task webhooks |
| `JWT_SECRET` | `dev-secret` | Auth token signing — set a strong value in production |
| `API_KEY` | _(none)_ | If set, secures the PM dashboard and MCP endpoint |
| `SMTP_HOST/USER/PASS` | _(none)_ | Email notifications on task completion |
| `SLACK_BOT_TOKEN` | _(none)_ | Slack notifications |

---

## Architecture

```
AgentInbox (hosted or self-hosted)      Your machine
─────────────────────────────────────   ──────────────────────────────
Auth + workspace management             claude-router.js  (Node)
Turso/SQLite task queue                 ngrok tunnel
File storage (base64 in DB)             Claude Code CLI
React PM dashboard                      Your project codebase
Client submission form                  CLAUDE.md + .claude/rules/
MCP server                              CLAUDE.local.md  (gitignored)
```

AgentInbox holds the queue and UI. Your local Claude does the actual work in your codebase. Works with any project, any stack, any language.

---

## Project structure

```
packages/
  server/          # MCP server + REST API  (TypeScript · Express · libsql)
  ui/              # React UI  (Vite · Tailwind)
    auth/          # Login + Signup
    submit/        # Client submission form
    status/        # Live task status page
    pm/            # PM dashboard
examples/
  claude-loop/     # Local router — trigger Claude via webhook
    claude-router.js
    projects.example.json
    README.md
```

---

## License

MIT — free to use, self-host, and modify.
