# AgentInbox

> Your clients submit bugs. Claude fixes them. Everyone sees what happened.

AgentInbox is an open-source task inbox that connects non-technical clients directly to a Claude agent. Clients submit bugs and feature requests through a simple web form — with optional file/screenshot attachment. Claude picks them up, fixes them in your real codebase, takes a screenshot of the live result, and writes back a plain-English summary. No PM in the middle, no WhatsApp chains, no lost context.

**Uses Claude Pro via CLI — no API key, no extra billing.**

---

## How it works

```
Client submits bug (+ optional screenshot/PDF)
              ↓
Task lands in AgentInbox  (status: pending)
              ↓
agentinbox-mcp notifies Claude Code in real time (WebSocket)
              ↓
Claude reads your codebase rules (CLAUDE.md / agentinbox.md)
              ↓
Claude fixes the bug, commits, takes a Playwright screenshot
              ↓
PM dashboard shows: Done ✓  with technical + plain summaries
                            + submitted image + Claude's screenshot
```

---

## Two parts, one setup

AgentInbox has two parts:

| Part | What it is | How you get it |
|------|-----------|----------------|
| **Server + dashboard** | Hosted web app — task queue, PM dashboard, submission form | Use ours at `agentinbox-k2vf.onrender.com` — or self-host |
| **`agentinbox-mcp`** | npm package — runs inside Claude Code on your machine | `npx agentinbox-mcp` (auto via `.mcp.json`) |

You do **not** install the server. You just sign up and point your `.mcp.json` at it.

---

## Quickstart (5 minutes)

### 1. Sign up

Go to [agentinbox-k2vf.onrender.com/signup](https://agentinbox-k2vf.onrender.com/signup) → workspace and first project created automatically.

### 2. Get your workspace token

PM dashboard → **Settings** tab → copy the `wt_...` token.

### 3. Add `agentinbox-mcp` to your project

In your project root, create `.mcp.json`:

```json
{
  "mcpServers": {
    "agentinbox": {
      "command": "npx",
      "args": ["-y", "agentinbox-mcp"],
      "env": {
        "AGENTINBOX_TOKEN": "wt_your_workspace_token_here"
      }
    }
  }
}
```

That's it. Every time Claude Code opens in this directory, `agentinbox-mcp` connects automatically — no ngrok, no extra terminals, no router. The npm package is fetched by `npx` on first run and cached after that.

### 4. Write your agent instructions

Create `CLAUDE.local.md` in your project root (gitignored):

```markdown
## AgentInbox — Autonomous Task Processing

When triggered via AgentInbox, process ALL pending tasks autonomously.

### Rules
1. Call get_pending_tasks() — get all unstarted tasks
2. For each task:
   - update_task_status(id, "in_progress")
   - get_task(id) to read full details
   - If has_file is true, call get_file(task_id) to see the attachment
   - Fix the bug or implement the feature
   - Take a Playwright screenshot of your live site
   - complete_task(id, summary_technical, summary_plain, screenshot_base64=<base64>)
3. If you cannot solve a task, call escalate_task(id, reason)
4. Work through ALL pending tasks before stopping

Stack: [your stack here]
Key files: [e.g. src/, schemas/]
```

### 5. Share your submission link

```
https://agentinbox-k2vf.onrender.com/submit/<project-token>
```

Send this link to your clients or QA team. No account needed to submit.

---

## Real-world use cases

### 1. Form schema / no-code platform bugs
A client notices a field label is wrong on a production form. They open the submission link, describe the issue, and attach a screenshot. Claude reads the JSON schema, makes the label change, uploads it to the API, navigates to the live URL, takes a screenshot proving the fix, and marks the task done — all without a developer touching anything.

### 2. Multi-environment projects (UAT + Prod)
Configure two projects pointing to the same codebase directory. Clients use the UAT token, internal PMs use the Prod token. Claude reads `custom_field_values.environment` and targets the right environment.

### 3. Approval-gated deployments
Enable **Require Approval** on a project. Claude proposes a fix plan — you approve or reject from the PM dashboard before any code runs. Useful for production where you want a human in the loop.

### 4. QA/testing pipelines
QA engineers submit test failures with screenshots. Claude reads the screenshot via `get_file()`, identifies the regression, fixes it, and replies with a Playwright screenshot of the passing state.

### 5. Client-facing bug intake for agencies
Give each client their own project token and submission link. All bugs flow into one PM dashboard. Claude fixes them autonomously. Clients see live status at `/task/<id>` without an account.

### 6. Rule-driven autonomous agents
Write `.claude/rules/` files per topic (schema fields, widget logic, validation, etc.). In `CLAUDE.local.md`, tell Claude which rule to read per area. Claude follows your conventions exactly — no hallucinated patterns.

---

## The Rules pattern (advanced)

For complex codebases, organise Claude's domain knowledge into topic-specific rule files.

```
.claude/
  rules/
    01-json-schema.md       # field types, dependencies, required
    02-widget-assignment.md # which UI widget maps to which field
    03-validation.md        # custom validation patterns
    04-deployment.md        # how to upload/deploy changes
  CLAUDE.md                 # index — tells Claude which rule to load per topic
CLAUDE.local.md             # gitignored — tokens, personal shortcuts, AgentInbox config
```

**`CLAUDE.md` (checked in):**
```markdown
## Rule Index
| Topic              | Rule file                       |
|--------------------|---------------------------------|
| Schema fields      | .claude/rules/01-json-schema.md |
| Widget assignment  | .claude/rules/02-widget-assignment.md |
| Validation         | .claude/rules/03-validation.md  |
| Upload/deploy      | .claude/rules/04-deployment.md  |

Read ONLY the relevant rule file before answering. Never load all at once.
```

---

## MCP tools

| Tool | What it does |
|------|-------------|
| `get_pending_tasks()` | Returns all unstarted tasks in the workspace |
| `get_task(id)` | Full task detail including custom fields and parsed file content |
| `update_task_status(id, status)` | Sets `in_progress`, `failed`, or `blocked` |
| `complete_task(id, technical, plain, pr_link?, screenshot_base64?)` | Writes summaries, stores screenshot, marks done |
| `get_file(task_id)` | Returns parsed content of uploaded PDF/image/doc |
| `escalate_task(id, reason)` | Flags for human review — PM gets instant toast notification |
| `propose_plan(id, plan)` | Proposes a fix plan — PM approves before Claude executes |

The `screenshot_base64` parameter accepts a base64-encoded PNG. Pass a Playwright screenshot and it renders inline in the PM dashboard task detail.

---

## PM Dashboard

Sign in at `/pm` with your credentials.

- All projects and tasks in one view
- Filter by status: pending / in_progress / awaiting_approval / done / failed / escalated
- Click any task for full detail: submitted image, Claude's screenshot, technical summary, plain summary, audit log
- **Real-time notifications** — toast alerts with sound when Claude completes, escalates, or needs approval. No refreshing needed.
- **Tab badge** — browser tab shows `(3) AgentInbox` when unread notifications exist
- Enable approval gate per project
- Add custom fields (Environment, Module, Step, Case ID, etc.)
- Copy submission links
- Get your workspace token (Settings tab)

---

## What persists

| Data | Where stored | Survives redeploy? |
|------|-------------|-------------------|
| Tasks, statuses, summaries | SQLite (local) or Turso (cloud) | Yes (Turso) |
| Uploaded images/PDFs | Base64 in DB | Yes |
| Claude's completion screenshots | Base64 in DB | Yes |
| User accounts, workspaces | DB | Yes |
| Audit log | DB | Yes |
| Codebase changes | Git | Yes (committed by Claude) |

---

## Monitoring

### Check task status (REST API)

```bash
# Get pending tasks (agent view)
curl -H "x-workspace-token: wt_xxx" \
  https://agentinbox-k2vf.onrender.com/api/agent/tasks/pending

# Get workspace info
curl -H "x-workspace-token: wt_xxx" \
  https://agentinbox-k2vf.onrender.com/api/agent/workspace
```

### PM dashboard

`https://agentinbox-k2vf.onrender.com/pm` — sign in to see all tasks across all projects.

### Task status page (shareable with clients)

```
https://agentinbox-k2vf.onrender.com/task/<task-id>
```

Clients can track their submission in real time without an account.

### MCP connection logs

When `agentinbox-mcp` starts, it logs to stderr (visible in Claude Code's MCP debug view):

```
[agentinbox-mcp] Connected to AgentInbox server
[agentinbox-mcp] Workspace: My Org (ws-id)
[agentinbox-mcp] New task: "Login button broken" (task-id)
```

---

## Self-hosting

You only need this if you want to run your own server instead of using the hosted version.

**Requires:** Node.js 18+, pnpm

```bash
git clone https://github.com/robindevkota/AgentInbox
cd AgentInbox

# Install dependencies
pnpm install

# Build UI + copy into server
pnpm --filter @agentinbox/ui build
node packages/server/scripts/copy-ui.js

# Build server TypeScript
cd packages/server && pnpm build && cd ../..

# Start
node packages/server/dist/cli.js start --port 3000
```

Sign up at `http://localhost:3000/signup`. PM dashboard at `http://localhost:3000/pm`.

Then in your project's `.mcp.json`, point at your local server:
```json
{
  "mcpServers": {
    "agentinbox": {
      "command": "npx",
      "args": ["-y", "agentinbox-mcp"],
      "env": {
        "AGENTINBOX_TOKEN": "wt_xxx",
        "AGENTINBOX_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Docker

```bash
docker compose up
```

Runs on port 3000. Sign up at `http://localhost:3000/signup`.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | SQLite path (ignored when TURSO_URL is set) |
| `TURSO_URL` | _(none)_ | Turso database URL — use for persistent cloud DB |
| `TURSO_AUTH_TOKEN` | _(none)_ | Turso auth token |
| `JWT_SECRET` | `dev-secret` | Auth token signing — set in production |
| `API_KEY` | _(none)_ | If set, secures the PM dashboard |
| `SEED_ADMIN_EMAIL` | `admin@example.com` | Default admin email on fresh DB |
| `SEED_ADMIN_PASSWORD` | `Admin123!` | Default admin password — change this |
| `SMTP_HOST/USER/PASS` | _(none)_ | Email notifications on task completion |
| `SLACK_BOT_TOKEN` | _(none)_ | Slack notifications |

---

## Architecture

```
AgentInbox (hosted or self-hosted)      Your machine
─────────────────────────────────────   ──────────────────────────────────
Auth + workspace management             agentinbox-mcp  (npm package)
SQLite/Turso task queue                   └─ WebSocket → server (real-time)
File storage (base64 in DB)               └─ REST calls /api/agent/*
React PM dashboard                      Claude Code CLI
Client submission form                  Your project codebase
REST + WebSocket API                    CLAUDE.md + .claude/rules/
                                        CLAUDE.local.md  (gitignored)
```

AgentInbox holds the queue and UI. Your local Claude does the actual work in your codebase. No ngrok, no extra terminals — `agentinbox-mcp` connects out to the server automatically.

---

## Project structure

```
packages/
  server/          # REST API + WebSocket server  (TypeScript · Express · SQLite)
  ui/              # React UI  (Vite · Tailwind)
  mcp/             # agentinbox-mcp npm package  (MCP + WebSocket client)
```

---

## License

MIT — free to use, self-host, and modify.
