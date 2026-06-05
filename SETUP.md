# AgentInbox — Setup Guide

Two actions. Done forever.

---

## One-time setup

**1. Download your setup file**
PM dashboard → Settings → Download Setup

**2. Open Claude Code in your project**
```bash
cd your-project
claude
```

**3. Paste the downloaded prompt**
Claude scans your codebase and writes two files automatically:
- `agentinbox-worker.js` — the background worker
- `start-worker.vbs` — the silent Windows startup script

**4. Claude adds the startup script to Windows**
Once added, you never touch it again.

---

## That's it

From now on:
```
PC turns on
  → worker starts silently in background (no window, no terminal)
  → task arrives → Claude wakes, fixes, exits
  → Telegram: ✅ Fixed
  → proof on PM dashboard
```

**VS Code does not need to be open. You don't need to be at your desk.**

No terminal commands. No polling. No idle tokens.

---

## How it works

```
Client submits bug via submission form
  → AgentInbox server (Render) stores task
  → WebSocket push: task.created
  → agentinbox-worker.js receives it instantly
  → spawns: claude --dangerously-skip-permissions --print "check pending tasks..."
  → Claude fixes it, calls complete_task, exits
  → Telegram ✅ + proof on PM dashboard
  → worker resets, listens for next task
```

---

## What gets created during setup

| File | Purpose |
|---|---|
| `agentinbox-worker.js` | Persistent WebSocket listener — spawns Claude on task arrival |
| `start-worker.vbs` | Silent Windows startup script — runs worker on PC boot |
| `CLAUDE.local.md` | Task processing rules for your stack |
| `.claude/rules/` | Domain knowledge files for your codebase |

`CLAUDE.local.md` and `agentinbox-worker.js` are added to `.gitignore` automatically.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed (Claude Pro or API key)
- Node.js 18+
- Windows (VBS startup script) — Mac/Linux support coming

---

## Run on a cloud VM (24/7 — no PC needed)

If you run the worker on a cloud VM, tasks get fixed around the clock — even when your PC is off.

**Setup on any Linux VM (AWS, DigitalOcean, Hetzner, etc.):**
```bash
# Install Node.js and Claude Code
npm install -g @anthropic-ai/claude-code

# Clone your project
git clone your-repo
cd your-project
npm install socket.io-client

# Run the worker permanently
AGENTINBOX_TOKEN=wt_xxx CLAUDE_PROJECT_PATH=/path/to/project node agentinbox-worker.js
```

Use `pm2` or `screen` to keep it running after you disconnect:
```bash
npm install -g pm2
AGENTINBOX_TOKEN=wt_xxx CLAUDE_PROJECT_PATH=/path/to/project pm2 start agentinbox-worker.js --name agentinbox
pm2 save && pm2 startup
```

**Cost:** ~$6/month (DigitalOcean basic droplet) + your existing Claude Pro ($20/month)
**Result:** bugs fixed at 3am, weekends, holidays — zero human involvement, ever

---

## Verify it's working

Check the log file anytime:
```
your-project\worker.log
```
Should show:
```
[worker] Connected to AgentInbox
[worker] Workspace: Your Workspace
```

---

## Telegram (optional — control Claude from your phone)

Once Telegram is configured via PM dashboard → Settings → Telegram:

**From the website** — clients/QA submit via submission form as normal.

**From your phone** — message the bot directly:
```
You: "fix the login button alignment on mobile"
Bot: "⚡ Task created — Claude is on it"
...
Bot: "✅ Fixed — Login.tsx line 42"
```

Control Claude mid-task by replying to bot messages:
- Approval needed → reply `approve` or `reject: your reason`
- Claude asks a question → reply with your answer

---

## Troubleshooting

**Worker not connecting**
- Check `worker.log` for error messages
- Verify your workspace token starts with `wt_`
- Make sure Node.js is installed: `node --version`

**Claude not waking on tasks**
- Check `worker.log` for `[worker] Waking Claude`
- If `claude` is not in PATH, edit `agentinbox-worker.js` and set the full path in `findClaude()`

**Tasks not appearing**
- Check PM dashboard — task may already be `in_progress`
- Verify submission link matches the correct project
