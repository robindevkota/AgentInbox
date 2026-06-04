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
Claude scans your codebase and configures everything automatically.

**4. Click "Allow automatic tasks" in VS Code**
VS Code asks once. Click Allow. Never asked again.

---

## That's it

From now on:
```
Open VS Code
  → Claude starts automatically
  → tasks arrive → Claude wakes, fixes, exits
  → you see results in the PM dashboard
```

No terminal commands. No polling. No idle tokens.

---

## What Claude sets up (you never touch these)

| File | Purpose |
|---|---|
| `.mcp.json` | Connects Claude to AgentInbox via WebSocket |
| `.vscode/tasks.json` | Starts Claude when VS Code opens |
| `CLAUDE.local.md` | Task processing rules for your stack |
| `.claude/rules/` | Domain knowledge files for your codebase |
| `CLAUDE.md` | Rule index — Claude loads only what's relevant |

`.mcp.json` and `CLAUDE.local.md` are added to `.gitignore` automatically.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed (Claude Pro or API key)
- Node.js 18+ 
- VS Code

---

## Troubleshooting

**MCP not connecting**
- Check `.mcp.json` exists in your project root
- Token must start with `wt_`
- Run `claude mcp list` to confirm agentinbox is registered

**Claude not waking on tasks**
- VS Code must be open — agentinbox-mcp only runs when Claude Code is active
- Check MCP logs for `[agentinbox-mcp] Connected`
- If `claude` is not in PATH, add `"CLAUDE_PATH": "/full/path/to/claude"` to the env in `.mcp.json`

**Tasks not appearing**
- Check PM dashboard — task may already be `in_progress`
- Verify submission link matches the correct project
