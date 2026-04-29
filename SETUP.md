# AgentInbox — Setup Guide

Clients submit bugs. Claude fixes them. Everyone sees what happened.

---

## What you need

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- A project codebase you want Claude to work on

---

## 1. Install AgentInbox

```bash
git clone https://github.com/robindevkota/AgentInbox.git
cd AgentInbox
pnpm install
pnpm build
```

---

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
DATA_DIR=./data
WEBHOOK_URL=http://localhost:4001/webhook
```

> If you are hosting on a server, set `BASE_URL=https://yourdomain.com`

---

## 3. Start AgentInbox server

```bash
pnpm --filter server dev
```

Or in production:

```bash
pnpm --filter server start
```

Open `http://localhost:3000` — you will see the AgentInbox dashboard.

---

## 4. Create your first workspace and project

1. Go to `http://localhost:3000/pm`
2. Create a workspace (your agency or company name)
3. Create a project (one project = one codebase)
4. Copy the **submission link** — this is what you send to clients

---

## 5. Add AgentInbox MCP to Claude (one-time global setup)

This lets Claude talk to AgentInbox from any project directory.

```bash
claude mcp add --scope user agentinbox http://localhost:3000/mcp
```

Verify it is registered:

```bash
claude mcp list
```

You should see `agentinbox` in the list.

---

## 6. Set up your project to receive tasks

Inside your project repository, create `scripts/agentinbox.md`. This file tells Claude what to do when a task arrives.

**Minimal version:**

```markdown
You are an autonomous agent. Follow these steps exactly without asking questions.

STEP 1: Call mcp__agentinbox__get_pending_tasks to get all pending tasks.

STEP 2: For each task:
  a) Call mcp__agentinbox__update_task_status with status "in_progress"
  b) Call mcp__agentinbox__get_task to read the full description
  c) If has_file=true, call mcp__agentinbox__get_file to see the attachment
  d) Fix the issue in the codebase
  e) Call mcp__agentinbox__complete_task with summary_technical and summary_plain

STEP 3: If you cannot solve a task, call mcp__agentinbox__escalate_task.

STEP 4: Process ALL pending tasks before stopping.

Project context:
- Stack: [your stack here, e.g. React + TypeScript]
- Key files: [e.g. src/components/, src/api/]

Start now by calling mcp__agentinbox__get_pending_tasks.
```

**With custom field routing (recommended):**

If you configured Module/Environment dropdowns in the PM dashboard settings, add a module map so Claude goes directly to the right file:

```markdown
Module Map (use custom_field_values.Module):
- "checkout"   → src/pages/checkout/
- "auth"       → src/pages/auth/
- "dashboard"  → src/pages/dashboard/

Environment Map (use custom_field_values.Environment):
- "UAT"  → fix in development branch only
- "Live" → production-ready fix
```

---

## 7. Configure the router

Edit `examples/claude-loop/projects.json` — add one entry per project:

```json
[
  {
    "token": "YOUR_PROJECT_TOKEN",
    "dir": "/absolute/path/to/your/project",
    "name": "My Project"
  },
  {
    "token": "ANOTHER_TOKEN",
    "dir": "/absolute/path/to/other/project",
    "name": "Other Project"
  }
]
```

Get your project token from the PM dashboard → Settings → Submission link (it is the last part of the URL).

---

## 8. Start the router

```bash
node examples/claude-loop/claude-router.js \
  --config examples/claude-loop/projects.json \
  --port 4001
```

On Windows:

```powershell
node "examples\claude-loop\claude-router.js" --config "examples\claude-loop\projects.json" --port 4001
```

You should see:

```
╔══════════════════════════════════════════════════════════════╗
║              AgentInbox Claude Router                        ║
╠══════════════════════════════════════════════════════════════╣
║  Webhook:  http://localhost:4001/webhook                     ║
║  Projects: 1                                                 ║
╠══════════════════════════════════════════════════════════════╣
║  • My Project        /absolute/path/to/your/project         ║
╚══════════════════════════════════════════════════════════════╝

Waiting for tasks... (Ctrl+C to stop)
```

---

## 9. Test end to end

1. Open your submission link: `http://localhost:3000/submit/YOUR_TOKEN`
2. Fill in the form and submit a task
3. Watch the router terminal — you should see `New task received`
4. Claude will wake up, read the task, and fix it
5. Check the PM dashboard to see the completed task with technical and plain-English summaries

---

## Hosting on a server (optional)

If you want PM and clients to access AgentInbox from anywhere without running it locally.

**Architecture:** The AgentInbox server (UI + API + MCP) runs in the cloud. Claude still runs on your dev machine. Clients and PM access the cloud URL.

---

### Option A — Run locally (simplest, recommended for solo developers)

No hosting needed. Everything runs on your machine.

```bash
pnpm --filter server dev
```

- PM opens `http://localhost:3000/pm`
- Clients use the submission link you copy from the PM dashboard
- Data lives in `./data/agentinbox.db` — persists forever on your machine
- Share your screen or use a tunnel (see Option B) if clients need remote access

---

### Option B — Render.com + Turso (free, no credit card required) ✅ Recommended for remote access

**What you get:** A permanent public URL for PM and clients. Claude still runs on your dev machine. Data persists in Turso (free hosted SQLite — no resets).

**Step 1 — Create a free Turso database (one-time, ~2 minutes)**

1. Sign up at [turso.tech](https://turso.tech) (GitHub login, free, no card)
2. Click **Create Database** → name it `agentinbox` → pick your nearest region
3. Click into the database → copy the **Database URL** (starts with `libsql://`)
4. Click **Create Token** → copy the token

**Step 2 — Deploy to Render**

1. Fork `https://github.com/robindevkota/AgentInbox` to your GitHub account
2. Go to [render.com](https://render.com) → sign up with GitHub (free, no card)
3. Click **New +** → **Web Service** → connect your forked repo
4. Render auto-detects `render.yaml` → click **Apply**
5. Wait ~5 minutes for the build to finish
6. You get a URL like `https://agentinbox-xxxx.onrender.com`
7. Go to **Environment** → add these two vars:
   - `TURSO_URL` = your database URL from Step 1
   - `TURSO_AUTH_TOKEN` = your token from Step 1
8. Click **Save Changes** — Render restarts with persistent storage

Your data now lives in Turso forever — redeploys never reset it.

**Step 3 — Set up a permanent tunnel (ngrok)**

The hosted server needs to reach your local Claude router via webhook.

1. Sign up at [ngrok.com](https://ngrok.com) (free, email only)
2. Download ngrok from [ngrok.com/download](https://ngrok.com/download) and install
3. Run: `ngrok config add-authtoken YOUR_NGROK_TOKEN`
4. Get your free static domain: ngrok dashboard → **Cloud Edge** → **Domains**
5. Start the tunnel (run this every time you work):
   ```bash
   ngrok http --domain=your-static-domain.ngrok-free.app 4001
   ```

**Step 4 — Connect webhook to Render**

In Render dashboard → your service → **Environment** → add:
```
WEBHOOK_URL = https://your-static-domain.ngrok-free.app/webhook
```

Save — Render restarts. Now tasks submitted via the hosted URL trigger Claude on your machine.

**Step 5 — Register MCP with Claude (one-time)**

```bash
claude mcp add --transport http --scope user agentinbox https://agentinbox-xxxx.onrender.com/mcp
```

**Every time you sit down to work, run two commands:**
```bash
# Terminal 1 — router
node examples/claude-loop/claude-router.js --config examples/claude-loop/projects.json --port 4001

# Terminal 2 — tunnel (permanent URL, never need to update Render again)
ngrok http --domain=your-static-domain.ngrok-free.app 4001
```

---

### Option C — VPS (~$5/month, fully persistent, no extra services)

Any VPS works: Hetzner, DigitalOcean, Linode, Vultr. SQLite persists on disk — no Turso needed.

```bash
# On the server
git clone https://github.com/robindevkota/AgentInbox.git
cd AgentInbox
pnpm install && pnpm build

# Set env
echo "PORT=3000
DATA_DIR=./data
WEBHOOK_URL=https://your-static-domain.ngrok-free.app/webhook" > packages/server/.env

# Run with PM2 to keep it alive
npm install -g pm2
pm2 start "node packages/server/dist/cli.js start" --name agentinbox
pm2 save
pm2 startup
```

> The router stays on your developer machine — Claude runs locally and calls back to the server via webhook.

---

## Auto-start on Windows (so the router survives reboots)

Use Task Scheduler to run the router at login:

1. Open **Task Scheduler** → Create Basic Task
2. Trigger: **At log on**
3. Action: Start a program
   - Program: `node`
   - Arguments: `"C:\path\to\AgentInbox\examples\claude-loop\claude-router.js" --config "C:\path\to\AgentInbox\examples\claude-loop\projects.json" --port 4001`
   - Start in: `C:\path\to\AgentInbox`
4. Finish

---

## Adding custom fields (Module, Environment, Steps dropdowns)

1. Go to PM dashboard → select your project → **Settings**
2. Scroll to **Custom fields**
3. Add a field: name it `Module`, type `Dropdown`, options `checkout,auth,dashboard`
4. Add another: `Environment`, options `UAT,Live`
5. Click **Save settings**
6. The submission form now shows those dropdowns
7. Claude receives `custom_field_values: { "Module": "checkout", "Environment": "UAT" }` with every task

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Router starts but nothing happens after submit | Check `WEBHOOK_URL` in `.env` matches the port your router is on |
| Claude says "message got cut off" | Make sure `scripts/agentinbox.md` starts with "You are an autonomous agent" |
| Claude reads Gmail instead of tasks | Remove Gmail MCP or add "Do NOT read Gmail" to `scripts/agentinbox.md` |
| Port already in use | Change `--port` on the router and update `WEBHOOK_URL` in `.env`, then restart the server |
| Projects don't show after reload | Make sure `pm_workspace_id` is saved in browser localStorage (happens automatically after first login) |
| MCP not found | Run `claude mcp add --scope user agentinbox http://localhost:3000/mcp` again |
| Data resets on Render redeploy | Set `TURSO_URL` and `TURSO_AUTH_TOKEN` env vars in Render — see Option B above |
| "This link is invalid or expired" on submit form | Project was wiped from DB — create it again in PM dashboard, or set up Turso so data persists |
