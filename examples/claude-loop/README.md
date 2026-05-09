# AgentInbox — Claude Loop (Local Router)

> Use Claude Pro as your AI backend — no API key, no extra cost.

Instead of Claude polling for tasks, a local router receives webhooks, writes a prompt file, and pipes it to the Claude CLI. Works with **Claude Pro** — no Anthropic API key needed.

---

## How it works

```
Client submits task via PM dashboard or submission form
         ↓
AgentInbox server sends webhook to your router
         ↓
Router triggers: claude --dangerously-skip-permissions --print
         ↓
Claude reads your context file (agentinbox.md), does the work
         ↓
Claude writes result back
         ↓
Client sees task marked done ✓
```

**The key insight:** Claude Pro gives you the full model. This router uses the Claude CLI instead of the API — $0 extra beyond your Pro subscription.

---

## What you need to run

| Component | Where it runs | Who sets it up |
|-----------|--------------|----------------|
| AgentInbox server (PM dashboard + submission form) | Cloud | Use the **hosted version** or self-host |
| `claude-router.js` | Your machine | You — runs as part of your project's `npm run dev` |
| ngrok tunnel | Your machine | You — free tier works |
| Claude Code CLI | Your machine | You — needs Claude Pro |

---

## AgentInbox server — hosted or self-hosted?

You have two options:

### Option A — Use the hosted version (recommended, no setup)

Go to [agentinbox-k2vf.onrender.com/pm](https://agentinbox-k2vf.onrender.com/pm), create a free workspace, and get your project token. No backend to run.

### Option B — Self-host

Run the AgentInbox server yourself:

```bash
git clone https://github.com/your-org/agentinbox
cd agentinbox
pnpm install
pnpm dev
```

PM dashboard at `http://localhost:5173/pm`. Use this if you want full control or are deploying for a team.

---

## Setup

### Step 1 — Get your project token

- **Hosted:** Go to [agentinbox-k2vf.onrender.com/pm](https://agentinbox-k2vf.onrender.com/pm) → create workspace → create project → copy token
- **Self-hosted:** Go to `http://localhost:5173/pm` → same steps

### Step 2 — Configure projects.json

Copy the example config:

```bash
cp projects.example.json projects.json
```

Fill in your token and project directory:

```json
[
  {
    "token": "paste-your-project-token-here",
    "dir": "C:\\Users\\you\\your-project",
    "name": "My Project"
  }
]
```

- **token** — from the PM dashboard
- **dir** — absolute path to your project on your machine (where Claude will run)
- **name** — any display name

> `projects.json` is gitignored — your tokens stay private.

### Step 3 — Write your context file

In your project directory, create `scripts/agentinbox.md`. This is what Claude reads when a task arrives:

```markdown
You are an autonomous agent working on My Project.

When a task arrives:
1. Read scripts/agentinbox-payload.json for the task details
2. Do the work described
3. Write your result to scripts/agentinbox-result.md
4. Delete scripts/agentinbox-payload.json when done

Project context:
- Stack: Next.js + Node.js + MongoDB
- Read BRAIN.md at project root for full context before starting
```

### Step 4 — Integrate into your project's dev command

The recommended way is to start the router and ngrok automatically as part of your existing `npm run dev`. Add `concurrently` to your project:

```bash
npm install --save-dev concurrently
```

Then update your `package.json` scripts:

```json
{
  "scripts": {
    "dev": "concurrently --names \"backend,frontend,router,ngrok\" \"npm run backend\" \"npm run frontend\" \"node /path/to/claude-router.js --config /path/to/projects.json --port 4001\" \"ngrok http --domain=your-permanent-domain.ngrok-free.app 4001\""
  }
}
```

**Now `npm run dev` starts everything at once** — your app, the router, and the ngrok tunnel. No separate terminals needed. Once set up, you never have to think about it again.

### Step 5 — Connect webhook

Copy your ngrok URL and paste it into the PM dashboard → project settings → Webhook URL:

```
https://your-domain.ngrok-free.app/webhook
```

That's it. Tasks now flow automatically:

```
Submission form → AgentInbox server → your router → Claude → done ✓
```

---

## No separate terminal needed

Once integrated into `npm run dev`, the router starts and stops with your project. You don't open AgentInbox separately — it's just part of your dev environment. A client submits a task while you're working, Claude handles it in the background, done.

> **ngrok tip:** Free tier URLs change every restart. Use a [paid ngrok plan](https://ngrok.com/pricing) for a permanent domain so you set the webhook URL once and never touch it again.

---

## Sending tasks to Claude

Share the submission link from the PM dashboard with your client:

```
https://agentinbox-k2vf.onrender.com/submit/<your-project-token>
```

No account needed on their side. They type the task, hit submit, and watch the status update live.

---

## Endpoints

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/webhook` | POST | Receives task webhooks from AgentInbox server |
| `/generate` | POST | Direct trigger — POST `{ slug, prompt }` to kick off Claude without AgentInbox |
| `/status/:slug` | GET | Poll for completion — returns `{ status: "pending" \| "done" }` |

---

## Multiple projects

One router handles multiple projects — just add entries to `projects.json`:

```json
[
  {
    "token": "token-for-project-a",
    "dir": "C:\\Projects\\project-a",
    "name": "Project A"
  },
  {
    "token": "token-for-project-b",
    "dir": "C:\\Projects\\project-b",
    "name": "Project B"
  }
]
```

Each project gets its own queue. If Claude is busy on one project and a task arrives for another, it queues and triggers automatically when Claude finishes.

---

## Security

Add `--secret` to lock your webhook endpoint:

```bash
node claude-router.js --config projects.json --port 4001 --secret my-secret
```

Set the same secret in the PM dashboard webhook settings. Requests without it are rejected with 401.

---

## Troubleshooting

**Claude doesn't start**
- Run `claude --version` to confirm it's installed and on your PATH
- Run `claude` once interactively to confirm you're signed in with Claude Pro

**Webhook not received**
- Check ngrok is running and the URL in the PM dashboard matches exactly
- Free ngrok URLs change on restart — update the webhook URL in the dashboard each time

**Task stuck as pending**
- Make sure your `agentinbox.md` tells Claude to delete `scripts/agentinbox-payload.json` when done — the router uses this as the completion signal
- Check the router terminal output for Claude errors

---

## File structure

```
examples/claude-loop/
  claude-router.js        # The router
  projects.json           # Your config (gitignored — copy from projects.example.json)
  projects.example.json   # Template — safe to commit
  README.md               # This file

your-project/
  package.json            # Add router + ngrok to your dev script here
  scripts/
    agentinbox.md           # Your Claude context/prompt (you write this)
    agentinbox-payload.json # Written by router on task arrival, deleted by Claude when done
    agentinbox-result.md    # Written by Claude with the result
```
