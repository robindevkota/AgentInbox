# AgentInbox — Setup Guide

One paste into Claude. Done forever.

---

## One-time setup

**1. Download your setup file**
PM dashboard → Settings → ↓ Download setup file

**2. Open Claude Code in your project**
```bash
cd your-project
claude
```

**3. Paste the downloaded prompt**
Claude scans your codebase and writes these files automatically:
- `agentinbox-worker.js` — the background worker
- `.mcp.json` — connects Claude to AgentInbox tools
- `agentinbox-start.bat` + `agentinbox-start.vbs` — silent Windows startup
- `agentinbox-start.sh` — Mac/Linux startup
- `CLAUDE.local.md` — task processing rules for your stack
- `.claude/rules/` — codebase domain knowledge

**4. Claude adds the startup script to your OS startup folder**
Once added, the worker starts silently on every PC boot. You never touch it again.

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
Client submits bug via submission form  (or you message your Telegram bot)
  → AgentInbox server stores task
  → WebSocket push: task.created
  → agentinbox-worker.js receives it instantly
  → spawns: claude --dangerously-skip-permissions --print "check pending tasks..."
  → Claude reads .mcp.json, connects to AgentInbox tools
  → fixes it, calls complete_task (with screenshot if verification is on), exits
  → Telegram ✅ + proof on PM dashboard
  → worker resets, listens for next task
```

---

## What gets created during setup

| File | Purpose |
|---|---|
| `agentinbox-worker.js` | Persistent WebSocket listener — spawns Claude on task arrival |
| `.mcp.json` | Gives Claude the AgentInbox tools (get_pending_tasks, complete_task, etc.) |
| `agentinbox-start.bat` | Windows: starts worker with env vars |
| `agentinbox-start.vbs` | Windows: runs .bat silently on PC boot |
| `agentinbox-start.sh` | Mac/Linux: starts worker on boot |
| `CLAUDE.local.md` | Task processing instructions for your stack |
| `.claude/rules/` | Domain knowledge files so Claude understands your codebase |

All these files are added to `.gitignore` automatically — nothing sensitive is committed.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed (Claude Pro or API key)
- Node.js 18+
- Windows, Mac, or Linux

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
your-project\agentinbox.log
```
Should show:
```
[worker] Starting...
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

## Screenshot verification (optional)

Enable **Screenshot verification** in PM dashboard → Settings → Project settings.

When enabled, after every fix Claude:
1. Starts your app locally
2. Opens Playwright and navigates to the relevant page
3. Takes a screenshot as proof
4. Attaches it to the task — visible in PM dashboard

Best for bug-fixing projects. Not needed for chat/support/analysis projects.

---

## Troubleshooting

**Worker not connecting**
- Check `agentinbox.log` for error messages
- Verify your workspace token starts with `wt_`
- Make sure Node.js is installed: `node --version`
- Make sure `.mcp.json` is in the project root

**Claude not waking on tasks**
- Check `agentinbox.log` for `[worker] Waking Claude`
- If `claude` is not in PATH, edit `agentinbox-worker.js` and set the full path in `findClaude()`

**get_pending_tasks not found**
- Make sure `.mcp.json` is in the project root (not a parent folder)
- Run `node agentinbox-worker.js` manually and check for errors

**Tasks not appearing**
- Check PM dashboard — task may already be `in_progress`
- Verify submission link matches the correct project
