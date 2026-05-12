# AgentInbox — Setup Guide

Full setup from zero to autonomous Claude agent in ~10 minutes.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and logged in (Claude Pro or API key)
- Node.js 18+
- A project Claude can work in (any stack)

---

## Part 1 — AgentInbox account

### 1. Sign up

Go to [agentinbox-k2vf.onrender.com/signup](https://agentinbox-k2vf.onrender.com/signup)

- Enter your name, email, and password
- Your workspace and first project are created automatically

### 2. Create a project

PM dashboard → **New Project** → give it a name.

Optional but recommended:
- **Require Approval** — Claude proposes a plan before running any code. Good for production.
- **Custom Fields** — add Environment, Module, Step, Case ID dropdowns so clients give structured info.

### 3. Get your workspace token

PM dashboard → **Settings** tab → **Workspace Token** → **Generate Token** → copy the `wt_...` value.

> Keep this token private — it gives full access to all tasks in your workspace.

### 4. Copy your submission link

PM dashboard → click your project → copy the **Submission Link**.
Share this with your clients or QA team. No account needed to submit.

---

## Part 2 — Connect Claude Code

### 5. Add `agentinbox-mcp` to your project

In your project root, create `.mcp.json`:

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

### 6. Write your agent instructions

Create `CLAUDE.local.md` in your project root and add it to `.gitignore`:

```markdown
## AgentInbox — Autonomous Task Processing

When triggered via AgentInbox, process ALL pending tasks autonomously.
Do not ask for confirmation. Work through all tasks before stopping.

### Rules
1. Call get_pending_tasks() — get all unstarted tasks
2. For each task:
   - update_task_status(id, "in_progress")
   - get_task(id) to read full details
   - If has_file is true, call get_file(task_id) to read the attachment
   - Analyse the task against your codebase
   - Fix the bug or implement the feature
   - Take a Playwright screenshot of your live site as proof
   - complete_task(id, summary_technical, summary_plain, screenshot_base64=<base64>)
3. If you cannot solve a task, call escalate_task(id, reason) — never leave it stuck
4. Work through ALL pending tasks before stopping

### Completion summaries
- summary_technical: file path + what changed + line number
  e.g. "Fixed label in schemas/form.json line 42 — renamed 'acc_type' to 'Account Type'"
- summary_plain: one sentence, no jargon
  e.g. "The account type field now shows the correct label."

### Your project context
Stack: [e.g. React + TypeScript + Express]
Key files: [e.g. src/components/, schemas/]
Deploy command: [e.g. npm run build && npm run deploy]
Live URL: [e.g. https://your-site.com]
```

### 7. Open Claude Code in your project

```bash
cd your-project
claude
```

Claude loads `agentinbox-mcp` automatically. You'll see in the MCP logs:
```
[agentinbox-mcp] Connected to AgentInbox server
[agentinbox-mcp] Workspace: Your Org (ws-id)
```

---

## Part 3 — Test it end to end

### 8. Submit a test task

Open your submission link in a browser and submit a simple test task:
- Title: `Test — change page title`
- Description: `Change the H1 on the homepage from "Hello" to "Hello World"`
- Priority: low

### 9. Trigger Claude

In your Claude Code session, type:

```
check my agent inbox and process any pending tasks
```

Claude will:
1. Call `get_pending_tasks()`
2. Read the task
3. Make the change
4. Take a screenshot
5. Call `complete_task()` with a summary

### 10. Check the PM dashboard

Open [agentinbox-k2vf.onrender.com/pm](https://agentinbox-k2vf.onrender.com/pm) — the task should show as **Done** with Claude's screenshot and summaries.

You'll also get a **real-time toast notification** with a sound the moment Claude completes the task — no refreshing needed. The browser tab title shows `(1) AgentInbox` so you notice even when the tab is in the background.

---

## Part 4 — Advanced: Rules pattern

For complex codebases, split Claude's domain knowledge into topic files so it only loads what's relevant.

```
.claude/
  rules/
    01-schema-fields.md      # field types, required, dependencies
    02-widget-logic.md       # which UI component maps to which field
    03-validation.md         # validation patterns
    04-deploy.md             # how to build and deploy
  CLAUDE.md                  # index — tells Claude which rule to load per topic
CLAUDE.local.md              # gitignored — tokens, AgentInbox config
```

**`CLAUDE.md` example:**
```markdown
## Rule Index
| Topic         | File                              |
|---------------|-----------------------------------|
| Schema fields | .claude/rules/01-schema-fields.md |
| Widget logic  | .claude/rules/02-widget-logic.md  |
| Validation    | .claude/rules/03-validation.md    |
| Deploy        | .claude/rules/04-deploy.md        |

Read ONLY the relevant rule file. Never load all at once.
```

In your `CLAUDE.local.md` agent instructions, add:
```markdown
- Read the relevant .claude/rules/ file before touching any schema/component
```

---

## Part 5 — Monitoring

### PM dashboard
`https://agentinbox-k2vf.onrender.com/pm`

Filter tasks by status, click any task to see the full audit trail, Claude's screenshot, and both summaries.

### Client task status page
```
https://agentinbox-k2vf.onrender.com/task/<task-id>
```
Clients can track their submission live without an account.

### REST API (for integrations)
```bash
# Pending tasks
curl -H "x-workspace-token: wt_xxx" \
  https://agentinbox-k2vf.onrender.com/api/agent/tasks/pending

# Workspace info
curl -H "x-workspace-token: wt_xxx" \
  https://agentinbox-k2vf.onrender.com/api/agent/workspace
```

---

## Troubleshooting

**MCP not connecting**
- Check `AGENTINBOX_TOKEN` is set correctly in `.mcp.json`
- Verify the token starts with `wt_`
- Run `claude mcp list` to confirm `agentinbox` is registered

**Tasks not appearing**
- Make sure the submission link token matches the project in your workspace
- Check the PM dashboard — the task may already be in_progress

**Claude not processing autonomously**
- Add "process ALL pending tasks without asking for confirmation" to `CLAUDE.local.md`
- Make sure `CLAUDE.local.md` is in the project root Claude Code opens in

**Screenshot missing in task detail**
- Make sure Claude calls `complete_task` with the `screenshot_base64` parameter
- Add to your agent instructions: "`screenshot_base64` is required, never omit it"

---

## Self-hosting

See the [main README](README.md#self-hosting) for Docker and bare-metal setup.

For self-hosted, add `AGENTINBOX_URL` to your `.mcp.json` env:
```json
"AGENTINBOX_URL": "http://localhost:3000"
```
