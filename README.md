# AgentInbox

> Drop a bug or feature request — AI ships the fix, everyone sees what happened.

AgentInbox is an open source MCP server that connects non-technical users directly to a Claude agent. Clients submit bugs and feature requests through a simple web form. Claude picks them up, fixes them in the real codebase, and writes back a plain-English summary. Everyone sees what happened — no PM in the middle, no WhatsApp chains, no lost context.

---

## How it works

```
Client opens their link → types bug → hits Submit
         ↓
Task lands in AgentInbox (status: pending)
         ↓
Claude agent calls get_pending_tasks() via MCP
         ↓
Claude reads the task, fixes the code, runs tests
         ↓
Claude calls complete_task() with two summaries:
  • Technical: "Fixed null check in LoginButton.tsx:47. PR #52."
  • Plain English: "The login issue on mobile is fixed."
         ↓
Client sees: Done ✓  (live, no refresh needed)
```

---

## Quick start

**Requires:** Node.js 18+, pnpm

```bash
git clone https://github.com/your-org/agentinbox
cd agentinbox
pnpm install
pnpm dev
```

Open `http://localhost:5173/pm` — the setup wizard walks you through creating your workspace and first project in 2 steps. No curl commands needed.

---

## Connect Claude

**Claude Code (CLI) — one command:**

```bash
claude mcp add agentinbox --transport http http://localhost:3000/mcp --scope user
```

**Claude Desktop — add to `claude_desktop_config.json`:**

```json
{
  "mcpServers": {
    "agentinbox": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Then in your project repo, add a `CLAUDE.md`:

```markdown
## AgentInbox
At the start of every session, call get_pending_tasks() and work through them.
For each task: update_task_status(in_progress) → fix it → complete_task(id, technical, plain).
```

Claude now picks up tasks automatically when you open a session in your project.

---

## MCP tools

| Tool | What it does |
|------|-------------|
| `get_pending_tasks()` | Returns all unstarted tasks across projects |
| `get_task(id)` | Full task detail including parsed file contents |
| `update_task_status(id, status)` | Sets in_progress, failed, blocked |
| `complete_task(id, technical, plain)` | Writes completion summary, marks done |
| `get_file(task_id)` | Returns parsed content of uploaded PDF/doc/image |
| `escalate_task(id, reason)` | Flags for human review |
| `propose_plan(id, plan)` | Proposes a fix plan — PM approves before Claude runs it |

---

## PM Dashboard

Open `http://localhost:5173/pm` — sign in with your workspace ID.

- See all projects and tasks in one view
- Filter by status: pending / in_progress / done / escalated
- Enable approval gate per project — Claude proposes a plan, you approve before any code runs
- Copy the client submission link for any project
- View audit log for every task

---

## Client submission form

Send your client one link — that's all they need:

```
http://localhost:5173/submit/<project-token>
```

No account. No install. Works on mobile. They type the bug, optionally upload a PDF or screenshot, and hit Submit. They watch the status update live.

---

## Environment variables

Copy `.env.example` to `.env`. Everything is optional — the server runs with zero config.

```bash
cp .env.example .env
```

| Variable | Default | What for |
|----------|---------|----------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | SQLite database location |
| `API_KEY` | _(none)_ | Locks PM dashboard — set for internet-facing deployments |
| `SMTP_HOST/USER/PASS` | _(none)_ | Email notifications on task completion |
| `SLACK_BOT_TOKEN` | _(none)_ | Slack `/inbox` slash command |
| `SLACK_SIGNING_SECRET` | _(none)_ | Slack request verification |

---

## Docker

```bash
docker compose up
```

Data is persisted in a named volume. Set `API_KEY` in your environment or a `.env` file before deploying to a public server.

---

## Architecture

```
AgentInbox (this repo)          Your project repo (private)
───────────────────────         ───────────────────────────
MCP server (port 3000)          Claude agent (Claude Code)
SQLite task queue               Your codebase
File storage (local)            CLAUDE.md with inbox instructions
React UI (port 5173 dev)        Git access
PM dashboard
Client submission form
```

AgentInbox knows nothing about your codebase. It holds tasks and statuses. Your Claude setup does the actual work and calls `complete_task` when done. Works with any project, any stack, any language.

---

## Project structure

```
packages/
  server/   # MCP server + REST API (TypeScript · Express · SQLite)
  ui/       # React UI (Vite · Tailwind)
    submit/ # Client bug submission form
    task/   # Live status page
    pm/     # PM dashboard + onboarding
examples/
  basic-setup/     # Single project, one developer
  multi-project/   # Agency with multiple clients
```

---

## Self-hosting

For production, run behind a reverse proxy (nginx, Caddy) with HTTPS. Set `API_KEY` to protect the PM dashboard. The SQLite database is a single file at `DATA_DIR/agentinbox.db` — back it up like any file.

---

## License

MIT — free to use, self-host, and modify.
