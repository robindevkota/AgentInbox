# AgentInbox — Setup Guide

Full setup from zero to autonomous Claude agent in ~10 minutes.

**You do not install the server.** AgentInbox is hosted at `agentinbox-k2vf.onrender.com`. The only thing you install is `agentinbox-mcp` — an npm package that runs inside Claude Code. It's fetched automatically via `npx` when Claude Code starts.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and logged in (Claude Pro or API key)
- Node.js 18+ (for `npx agentinbox-mcp`)
- A project Claude can work in (any stack)

---

## Part 1 — AgentInbox account

### 1. Sign up

Go to [agentinbox-k2vf.onrender.com/signup](https://agentinbox-k2vf.onrender.com/signup)

- Enter your name, email, and password
- Your workspace and first project are created automatically
- New accounts start on the **Free plan** — 1 project, 50 tasks/month. Upgrade anytime from the PM dashboard.

### 2. Create a project

PM dashboard → **New Project** → give it a name.

Optional but recommended:
- **Require Approval** — Claude proposes a plan before running any code. Good for production.
- **Custom Fields** — add Environment, Module, Step, Case ID dropdowns so clients give structured info.

### 3. Get your workspace token

PM dashboard → click any project → **Settings** → scroll to **Workspace Token**. Copy the `wt_...` token. The Settings panel also shows a ready-to-paste `.mcp.json` snippet with your token already filled in.

> Keep this token private — it gives full access to all tasks in your workspace. Add `.mcp.json` to `.gitignore` or use `CLAUDE.local.md` (which is gitignored by default) to store it.

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

Create `CLAUDE.local.md` in your project root:

```bash
# Add to .gitignore so your token never gets committed
echo "CLAUDE.local.md" >> .gitignore
```

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

## Part 2.5 — Teach Claude your codebase

This is the most important step. AgentInbox delivers the task — but **how well Claude fixes it depends entirely on what you put in `CLAUDE.local.md`**. A bare template produces generic fixes. A well-written context file produces fixes that match your conventions, use your patterns, and deploy correctly.

### Simple project (fill in the template)

For most projects, filling out the placeholders in `CLAUDE.local.md` is enough:

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
   - Fix the bug or implement the feature
   - Take a Playwright screenshot of your live site as proof
   - complete_task(id, summary_technical, summary_plain, screenshot_base64=<base64>)
3. If you cannot solve a task, call escalate_task(id, reason) — never leave it stuck
4. Work through ALL pending tasks before stopping

### Project context
Stack: React + TypeScript + Express + PostgreSQL
Key files: src/components/, src/api/routes/, src/db/schema.ts
Run tests: npm test
Deploy: npm run build && pm2 restart app
Live URL: https://myapp.com
Do NOT touch: src/legacy/, database migrations (ask first)
```

The more specific you are, the better. Tell Claude:
- Where your components live
- How to run your test suite
- How to deploy or restart
- What files or folders are off-limits
- Any naming conventions or patterns you follow

### Complex project (use the Rules pattern)

For large codebases, put Claude's domain knowledge into separate rule files so it only loads what's relevant per task. This keeps context tight and fixes accurate.

**Recommended folder structure (works for any stack):**

```
your-project/
  .claude/
    rules/
      01-architecture.md    # how the codebase is structured, key entry points
      02-data.md            # database schema, models, query patterns
      03-api.md             # API patterns, auth, error handling conventions
      04-ui.md              # UI patterns, components, naming conventions
      05-testing.md         # how to run tests, what to test, test patterns
      06-deploy.md          # build steps, deploy command, environments
    agents/
      fix-bug.md            # specialist agent for bug fixes
      review.md             # specialist agent for code review before deploy
    skills/
      run-tests.md          # reusable skill: run test suite + report failures
      take-screenshot.md    # reusable skill: Playwright screenshot of live site
  CLAUDE.md                 # index — tells Claude which rule to load per topic
  CLAUDE.local.md           # gitignored — AgentInbox token + task processing rules
  .mcp.json                 # gitignored — MCP server config with workspace token
```

**What each folder does:**

| Folder | Purpose |
|---|---|
| `.claude/rules/` | Domain knowledge — Claude reads only the relevant file per task |
| `.claude/agents/` | Specialist sub-agents Claude can spin up for specific task types |
| `.claude/skills/` | Reusable task patterns Claude can invoke (run tests, take screenshot, deploy) |
| `CLAUDE.md` | Checked in — rule index + golden rules that always apply |
| `CLAUDE.local.md` | Gitignored — your AgentInbox token + autonomous task instructions |

> **`agents/` and `skills/` are completely optional.** They are Claude Code features — how you organise them is entirely up to you and depends on your workflow. AgentInbox only requires `CLAUDE.local.md` with the task processing rules. Everything else is how you choose to structure your Claude workspace. Start simple, add rules and agents only when you feel Claude needs more context to work accurately in your codebase.

**`CLAUDE.md` (checked in — safe to commit):**
```markdown
## Rule Index
| Topic        | File                          |
|--------------|-------------------------------|
| Architecture | .claude/rules/01-architecture.md |
| Components   | .claude/rules/02-components.md   |
| API routes   | .claude/rules/03-api.md          |
| Database     | .claude/rules/04-database.md     |
| Deploy       | .claude/rules/05-deploy.md       |

Read ONLY the relevant rule file before working on a task. Never load all at once.
```

**`CLAUDE.local.md` (gitignored — add your AgentInbox instructions here):**
```markdown
## AgentInbox — Autonomous Task Processing

When triggered via AgentInbox, process ALL pending tasks autonomously.

### Rules
1. Call get_pending_tasks()
2. For each task:
   - update_task_status(id, "in_progress")
   - get_task(id) — read title, description, custom_field_values
   - Read the relevant .claude/rules/ file for context before making changes
   - Fix the bug or implement the feature
   - Run tests: npm test
   - Take a Playwright screenshot of the live result
   - complete_task(id, summary_technical, summary_plain, screenshot_base64=<base64>)
3. If blocked, call escalate_task(id, reason)
```

### What makes a good rule file

Each rule file should answer: *"What does Claude need to know to work in this area without asking questions?"*

**Good `01-architecture.md`:**
```markdown
# Architecture

Backend: Express + TypeScript at /backend/src
Frontend: React + Vite at /frontend/src
Database: PostgreSQL via Prisma — schema at /backend/prisma/schema.prisma

Key entry points:
- API server: /backend/src/index.ts
- React root: /frontend/src/main.tsx
- Route files: /backend/src/routes/*.ts

Naming: kebab-case files, PascalCase components, camelCase functions.
All API responses: { data, error } shape.
Auth: JWT in Authorization header — middleware at /backend/src/middleware/auth.ts
```

**Good `05-deploy.md`:**
```markdown
# Deploy

Local dev: npm run dev (starts both frontend + backend via concurrently)
Build: npm run build (outputs to /dist)
Deploy: git push origin main (auto-deploys via Render)
Test: npm test (Jest + Supertest)

After any schema change: npx prisma migrate dev
After any frontend change: verify at http://localhost:3000
Do NOT push directly to main without running tests first.
```

The rule files are plain markdown — write them like notes to a new developer joining your team.

---

## Part 3 — Test it end to end

### 8. Submit a test task

Open your submission link in a browser and submit a simple test task:
- Title: `Test — change page title`
- Description: `Change the H1 on the homepage from "Hello" to "Hello World"`
- Priority: low

### 9. Claude picks it up automatically

As soon as the task is submitted, `agentinbox-mcp` receives a real-time notification via WebSocket and logs it:
```
[agentinbox-mcp] New task: "Test — change page title" (task-id)
```

Claude receives the notification in real time. Since Claude Code requires an active session to act, trigger it manually the first time to verify everything works:

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
