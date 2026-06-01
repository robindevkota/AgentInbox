# agentinbox-mcp

MCP server for [AgentInbox](https://useagentinbox.com) — connects your Claude Code agent to your AgentInbox workspace. One-time setup, no ngrok, no extra terminals.

## Setup

### 1. Get your workspace token

Sign in at [useagentinbox.com/pm](https://useagentinbox.com/pm) → **Settings** → **Workspace Token** → copy the `wt_...` token.

### 2. Add to `.mcp.json` in your project root

```json
{
  "mcpServers": {
    "agentinbox": {
      "command": "npx",
      "args": ["-y", "agentinbox-mcp"],
      "env": {
        "AGENTINBOX_TOKEN": "wt_your_token_here"
      }
    }
  }
}
```

### 3. Add agent instructions

Create `CLAUDE.local.md` in your project root (add to `.gitignore`):

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

Stack: [your stack]
Key files: [e.g. src/, schemas/]
```

That's it. Every time Claude Code opens in this directory, the MCP server starts and connects to AgentInbox automatically.

---

## How it works

`agentinbox-mcp` runs as a local MCP server process. It:
- Connects to the AgentInbox server via WebSocket for real-time task notifications
- Exposes 7 MCP tools Claude uses to read, process, and complete tasks
- Calls the AgentInbox REST API using your workspace token

```
AgentInbox server  ←──WebSocket──  agentinbox-mcp  ←──stdio──  Claude Code
     ↑                                    ↓
Client submits bug              Claude fixes your codebase
```

---

## MCP tools

| Tool | Description |
|------|-------------|
| `get_pending_tasks()` | Get all unstarted tasks in your workspace |
| `get_task(id)` | Full task detail including custom fields and file content |
| `update_task_status(id, status)` | Set `in_progress`, `blocked`, or `failed` |
| `complete_task(id, technical, plain, screenshot_base64?)` | Mark done with summaries + screenshot |
| `get_file(task_id)` | Get parsed content of uploaded PDF/image/doc |
| `escalate_task(id, reason)` | Flag for human review |
| `propose_plan(id, plan)` | Propose a fix plan for PM approval before executing |

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENTINBOX_TOKEN` | Yes | — | Workspace token (`wt_...`) from the PM dashboard |
| `AGENTINBOX_URL` | No | `https://useagentinbox.com` | Override for self-hosted instances |

---

## Self-hosted AgentInbox

If you're running AgentInbox locally or on your own server:

```json
{
  "mcpServers": {
    "agentinbox": {
      "command": "npx",
      "args": ["-y", "agentinbox-mcp"],
      "env": {
        "AGENTINBOX_TOKEN": "wt_your_token_here",
        "AGENTINBOX_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Links

- [PM Dashboard](https://useagentinbox.com/pm)
- [Sign up](https://useagentinbox.com/signup)
