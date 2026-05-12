# AgentInbox

> Your clients submit bugs. Claude fixes them. Everyone sees what happened.

AgentInbox is an open source task inbox that connects non-technical clients directly to a Claude agent. Clients submit bugs and feature requests through a simple web form. Claude picks them up, fixes them in your real codebase, and writes back a plain-English summary — no PM in the middle, no WhatsApp chains, no lost context.

**Uses Claude Pro via CLI — no API key, no extra cost.**

---

## Two ways to use it

### Option A — Hosted (recommended, zero setup)

Sign up at the hosted instance, get your project token, and run the local router. No backend to host.

**[→ Get started with the hosted version](#hosted-quickstart)**

### Option B — Self-host

Run everything yourself with Docker or pnpm.

**[→ Self-hosting guide](#self-hosting)**

---

## How it works

```
Client submits bug via your submission link
         ↓
Task lands in AgentInbox (status: pending)
         ↓
Local router receives webhook → triggers Claude CLI
         ↓
Claude reads your codebase context (agentinbox.md)
         ↓
Claude fixes the bug, writes result
         ↓
Client sees: Done ✓  (live, no refresh needed)
```

**Uses Claude Pro — not the API.** The local router pipes tasks to `claude --print` on your machine. Zero extra cost beyond your $20/month Claude subscription.

---

## Hosted quickstart

### 1. Create your account

Go to [agentinbox-k2vf.onrender.com/signup](https://agentinbox-k2vf.onrender.com/signup) → sign up → your workspace and first project are created automatically.

### 2. Create a project and copy your token

Open the PM dashboard → **+ New Project** → copy the submission link token.

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

### 4. Write your context file

In your project, create `scripts/agentinbox.md` — this is what Claude reads when a task arrives:

```markdown
You are an autonomous agent working on My Project.

When a task arrives:
1. Call get_pending_tasks() to get all pending tasks
2. For each task: update_task_status(in_progress) → fix it → complete_task(id, technical, plain)
3. If you cannot solve a task, call escalate_task(id, reason)

Stack: React + TypeScript. Read CLAUDE.md for full context.
```

### 5. Start the router + ngrok

```bash
# Terminal 1 — router
node claude-router.js --config projects.json --port 4001

# Terminal 2 — tunnel
ngrok http 4001
```

### 6. Connect webhook

Copy your ngrok URL → PM dashboard → project settings → Webhook URL:
```
https://xxxx.ngrok-free.app/webhook
```

**Done.** Share your submission link with clients:
```
https://agentinbox-k2vf.onrender.com/submit/<your-token>
```

→ Full router docs: [examples/claude-loop/README.md](examples/claude-loop/README.md)

---

## Self-hosting

**Requires:** Node.js 18+, pnpm

```bash
git clone https://github.com/robindevkota/AgentInbox
cd AgentInbox
pnpm install
pnpm dev
```

Sign up at `http://localhost:3000/signup` — your workspace is created automatically.

PM dashboard: `http://localhost:3000/pm`

### Connect Claude via MCP (alternative to router)

```bash
claude mcp add agentinbox --transport http http://localhost:3000/mcp --scope user
```

Then add to your project's `CLAUDE.md`:

```markdown
## AgentInbox
At the start of every session, call get_pending_tasks() and work through them.
For each task: update_task_status(in_progress) → fix it → complete_task(id, technical, plain).
```

Claude picks up tasks automatically when you open a session.

---

## MCP tools

| Tool | What it does |
|------|-------------|
| `get_pending_tasks()` | Returns all unstarted tasks |
| `get_task(id)` | Full task detail including parsed file contents |
| `update_task_status(id, status)` | Sets in_progress, failed, blocked |
| `complete_task(id, technical, plain)` | Writes completion summary, marks done |
| `get_file(task_id)` | Returns parsed content of uploaded PDF/doc/image |
| `escalate_task(id, reason)` | Flags for human review |
| `propose_plan(id, plan)` | Proposes a fix plan — PM approves before Claude runs it |

---

## PM Dashboard

Sign in at `/pm` with your account credentials.

- See all projects and tasks in one view
- Filter by status: pending / in_progress / done / escalated
- Enable approval gate — Claude proposes a plan, you approve before any code runs
- Copy client submission links
- View audit log for every task
- Add custom fields (Environment, Module, Steps, Case ID, etc.) per project

---

## Client submission form

Send your client one link — that's all they need:

```
https://agentinbox-k2vf.onrender.com/submit/<project-token>
```

No account. No install. Works on mobile. They fill in the form, optionally upload a file or screenshot, and hit Submit. Status updates live.

---

## Environment variables

| Variable | Default | What for |
|----------|---------|----------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | Local SQLite database location (ignored when TURSO_URL is set) |
| `TURSO_URL` | _(none)_ | Turso/libsql database URL — use for persistent hosted DB |
| `TURSO_AUTH_TOKEN` | _(none)_ | Turso auth token |
| `WEBHOOK_URL` | _(none)_ | URL of your local router (e.g. your ngrok tunnel) |
| `JWT_SECRET` | `dev-secret` | Sign auth tokens — set a strong secret in production |
| `SMTP_HOST/USER/PASS` | _(none)_ | Email notifications on task completion |
| `SLACK_BOT_TOKEN` | _(none)_ | Slack notifications |
| `SLACK_SIGNING_SECRET` | _(none)_ | Slack request verification |

---

## Architecture

```
AgentInbox (hosted or self-hosted)    Your machine
──────────────────────────────────    ──────────────────────────
Auth + workspace management           claude-router.js (Node)
Turso/SQLite task queue               ngrok tunnel
File storage                          Claude Code CLI
React PM dashboard                    Your project codebase
Client submission form                scripts/agentinbox.md
```

AgentInbox holds tasks and statuses. Your local Claude does the actual work. Works with any project, any stack, any language.

**Data persistence:** When using Turso (`TURSO_URL` set), all data — tasks, projects, users, completions — persists permanently regardless of server restarts or Render redeploys.

---

## Project structure

```
packages/
  server/              # MCP server + REST API (TypeScript · Express · libsql/SQLite)
  ui/                  # React UI (Vite · Tailwind)
    auth/              # Login + Signup pages
    submit/            # Client bug submission form
    status/            # Live task status page
    pm/                # PM dashboard
examples/
  claude-loop/         # Local router — trigger Claude via webhook (recommended)
    claude-router.js   # The router
    projects.example.json
    README.md          # Full setup guide
```

---

## Self-hosting in production

Run behind a reverse proxy (nginx, Caddy) with HTTPS. Set `JWT_SECRET` to a strong random string.

**With Turso (recommended):** Set `TURSO_URL` and `TURSO_AUTH_TOKEN` — data persists forever across restarts and redeploys.

**With local SQLite:** Data lives at `DATA_DIR/agentinbox.db` — back it up like any file.

```bash
docker compose up
```

---

## License

MIT — free to use, self-host, and modify.
