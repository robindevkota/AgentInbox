# AgentInbox — Full Product Plan

> An open source AI-powered task inbox where non-technical users submit bugs and features, and an autonomous Claude agent executes them, commits the code, and reports back.

---

## The Problem

Every software agency runs the same painful chain:

```
Client / End User
  → WhatsApp / Email to PM
    → PM messages Developer
      → Dev fixes it
        → Dev tells PM
          → PM tells Client
```

**5 human handoffs. Zero of them add value.**

The developer gets interrupted. The PM becomes a messenger. The client waits.
This happens dozens of times a week at every agency, every software company, every consultancy.

The old workaround (what triggered this idea): creating Gmail labels, writing emails manually every time, running a polling script to fetch them, then feeding that to Claude. Fragile, manual, and not reusable across projects.

No tool fixes the full loop. Jira manages tasks but doesn't execute them. Devin executes but has no client intake. GitHub Copilot helps developers but needs a developer to drive it. Nobody owns the full chain: intake → execute → report back.

That gap is AgentInbox.

---

## What AgentInbox Is

AgentInbox feels like a **live work channel** — not email, not a ticket system. The client drops a message or file, Claude sees it immediately, starts working, and writes back when done. Like texting your dev team except the other side is Claude and it actually ships the code.

It is two things working together:

### 1. An MCP Server (open source, self-hostable)
A task queue server that speaks the Model Context Protocol. Any Claude instance connects to it the same way you connect GitLab, Google Drive, or any other MCP tool — one line in the Claude config and Claude has full access to the inbox tools.

### 2. A Hosted Client-Facing Web UI
A simple interface where non-technical users (clients, PMs, QA, end users) submit bugs, feature requests, or any task. They get a link. They open it in a browser. No install, no account, no technical knowledge needed. It feels like a modern support portal — something they already know how to use.

When a task is submitted, Claude picks it up, does the work in the connected codebase, and writes a plain-English summary back to the inbox. The submitter sees: **received → in progress → done: here's what changed.**

---

## How It Works — The Full Flow

```
1. Company B staff opens their project link
   └── agentinbox.io/submit/x7k2-9pqr-mnt4-zzab
   └── Types: "the login button is broken on mobile"
   └── Or uploads: feature_spec.pdf / screenshot.png

2. Task lands in the MCP task queue
   └── Status: pending

3. Claude agent (running on developer's machine or CI)
   └── Calls get_pending_tasks() via MCP
   └── Reads the task + any attached file content
   └── Status updates to: in_progress

4. Claude works inside the real project repo
   └── Has full codebase context via developer's skills setup
   └── Finds the bug / builds the feature
   └── Runs tests
   └── Commits and pushes (branch or PR)

5. Claude calls complete_task(id, summary) on MCP server
   └── Technical summary for PM:
       "Fixed login button on mobile. Null check missing on
        viewport width. Fixed in auth/LoginButton.tsx line 47.
        Tests pass. PR #52 open for review."
   └── Plain English for client:
       "The login issue on mobile is fixed. It was a small bug
        that only appeared on phone screens. Please try again
        and let us know if you see anything else."

6. UI updates live for everyone
   └── Company B staff: status → Resolved + plain English summary
   └── PM: full technical summary + PR link
   └── Developer: optionally notified, not interrupted
```

---

## Architecture

### Two Repos, Fully Separated

```
AgentInbox (open source)          Your Real Project (private)
─────────────────────────         ──────────────────────────
MCP server                        Claude agent runtime
Task queue (SQLite/Postgres)      Your codebase + skills
File storage (local or S3)        Test setup
Web UI for submissions            Git access
Completion summaries
Webhook receiver
```

AgentInbox knows **nothing** about your codebase. It just holds tasks and statuses. Your Claude setup does all the actual work and calls `complete_task` when done. This means AgentInbox works with **any project, any stack, any language.**

### MCP Tools Exposed to Claude

| Tool | What it does |
|------|-------------|
| `get_pending_tasks()` | Returns all unstarted tasks — Claude polls this |
| `get_task(id)` | Full task detail including parsed file contents |
| `update_task_status(id, status)` | Sets in_progress, failed, blocked |
| `complete_task(id, summary)` | Writes completion summary, marks done |
| `get_file(task_id)` | Returns parsed content of uploaded PDF/doc/image |
| `escalate_task(id, reason)` | Flags for human review when agent genuinely can't solve it |

### Claude Config — Any User, One Line

```json
{
  "mcpServers": {
    "agentinbox": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Same pattern as connecting GitLab, Google Drive, or any other MCP tool. Zero custom code required per project.

---

## Authentication Strategy

Authentication is tiered by use case — least friction for end users, more control for teams that need it.

### Tier 1 — Link-based, no login (MVP default)
The link itself is the authentication. Long unguessable token in the URL:

```
agentinbox.io/submit/x7k2-9pqr-mnt4-zzab
```

If you have the link you can submit. If you don't, you can't find it. Same model as Notion share links, Calendly, Google Forms. Company A sends the link to Company B once — they bookmark it, use it forever. Zero friction, zero accounts.

**Best for:** End users, clients, non-technical staff. Anyone who previously sent bugs over WhatsApp.

### Tier 2 — Email verification (hosted version)
Person opens the link, enters their email, receives a one-time code. If their email is on the permitted list for that project, they get in. No password to remember.

**Best for:** Teams that want to control exactly which individuals at Company B can submit.

### Tier 3 — Full login with SSO (enterprise)
Proper accounts, passwords, SSO via Google/Microsoft. For large corporates with security and compliance requirements.

**Rule of thumb:** The less technical the user, the less authentication friction. A Company B staff member who used to report bugs over WhatsApp will abandon a signup form before submitting their first task.

---

## User Experiences

### Developer (one-time setup per project)
1. `npx agentinbox start` — spins up MCP server and UI
2. Add one line to Claude MCP config
3. Create a project, link the repo, set up Claude skills
4. Add permitted users or copy the submission link
5. Walk away — Claude watches the inbox and handles tasks automatically

Developer is only contacted when the agent escalates something it genuinely cannot solve.

### PM / QA (oversight without touching code)
- Dashboard shows all projects, all tasks, all statuses in real time
- Optional approval gate: Claude proposes fix, PM reads plain-English plan, clicks Approve or Reject before anything is pushed
- Notified on every task completion
- Can add comments or extra context to any task
- Full audit log of everything the agent did

### Client / End User (zero friction)
- Gets one link, works forever, no account needed
- Opens in browser, types bug or feature, uploads file if needed, hits submit
- Watches same page update live: Received → Working on it → Fixed
- Reads plain-English summary of what was done
- Never knows Claude exists, never touches GitHub

---

## Multi-Tenant, Multi-Project Support

Company A runs multiple projects for multiple clients. Each project is fully isolated.

Each project gets:
- Its own submission link (unguessable token)
- Its own permitted user list
- Its own Claude skills config (different stacks per project)
- Its own task inbox and completion log
- Its own notification settings

Users see only their project. Company B staff cannot see Company C tasks. No cross-contamination.

```
Company A (workspace owner)
├── Project 1 — ecommerce app
│   ├── Link: agentinbox.io/submit/x7k2...
│   ├── Permitted: Company B staff, PM Sarah, QA John
│   ├── Agent skills: React + Node.js context
│   └── Repo: github.com/companyA/project1
│
├── Project 2 — mobile banking app
│   ├── Link: agentinbox.io/submit/p9qr...
│   ├── Permitted: Company C staff, PM Sarah
│   ├── Agent skills: Flutter + Firebase context
│   └── Repo: github.com/companyA/project2
│
└── Project N — any stack, any client
    ├── Link: agentinbox.io/submit/mnt4...
    ├── Permitted: custom list
    └── Repo: any git repo
```

---

## What to Build (in order)

### ✅ Phase 1 — MCP Core (Week 1–2) — DONE
The foundation everything else plugs into.

- [x] MCP server in Node.js (TypeScript)
- [x] Task queue with SQLite (zero config to start)
- [x] All six MCP tools: `get_pending_tasks`, `get_task`, `update_task_status`, `complete_task`, `get_file`, `escalate_task`
- [x] File upload with PDF + image + Word doc parsing
- [x] Basic REST API for the UI
- [x] `npx agentinbox start` one-command setup

### ✅ Phase 2 — Submission UI (Week 2–3) — DONE
What clients and managers actually touch.

- [x] Simple web form: text input + file upload
- [x] Real-time task status: pending / in progress / done
- [x] Two completion summaries: technical for PM, plain English for client
- [x] Project isolation via unguessable link tokens (Tier 1 auth)
- [x] No login required for submission
- [x] Mobile friendly — clients often on phones

### ✅ Phase 3 — Multi-Project + Roles (Week 3–4) — DONE
The corporate feature set.

- [x] Workspace concept (Company A as container)
- [x] Multiple projects per workspace
- [x] PM dashboard: all projects, all tasks, one view
- [x] Approval gate: Claude proposes, PM approves before push
- [x] Email notifications on task completion (nodemailer, any SMTP)
- [x] Email verification auth (Tier 2) for stricter access control

### ✅ Phase 4 — Hosted Version (Post-launch) — DONE
Where the money comes from.

- [ ] `agentinbox.io` hosted deployment
- [ ] Team management and billing
- [x] Usage dashboard per workspace
- [x] Slack integration: submit tasks directly from Slack (`/inbox` + `/inbox-status` commands)
- [ ] WhatsApp integration: Company B submits from WhatsApp, lands in inbox automatically
- [x] White label: agencies brand the UI as their own client portal (brand name, color, logo)
- [ ] SSO / enterprise auth (Tier 3)
- [ ] SOC2 compliance for enterprise customers

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| MCP server | Node.js + TypeScript | Native Anthropic MCP SDK support |
| Task queue | SQLite → Postgres | Zero config for self-hosted, scalable for hosted |
| File parsing | pdf-parse + mammoth | PDF and Word doc support out of the box |
| Web UI | React | Component reuse across submit / status / PM dashboard |
| Auth | Link tokens → email OTP → SSO | Progressive, least friction first |
| Real-time updates | Server-sent events | Live status without WebSocket complexity |
| Hosted infra | Railway or Fly.io | Simple deployment, scales easily |

---

## Business Model

### Open Source (free forever)
Self-hosted MCP server + UI. Anyone runs it on their own machine or server. Builds GitHub stars, developer trust, and community.

### Hosted SaaS
| Plan | Price | For |
|------|-------|-----|
| Starter | $49/month | Freelancers, solo devs, up to 3 projects |
| Agency | $199/month | Agencies, up to 10 projects, PM dashboard, approval gates |
| Company | $499/month | Corporates, unlimited projects, SSO, audit logs, SLA |

### White Label
Agencies pay $300–500/month to brand the submission UI as their own client portal. Their clients see the agency's name and logo. Agencies look professional. You get recurring revenue.

### Onboarding / Setup
One-time $500–2000 per client for custom setup, skills configuration, and integration with existing stack. Valuable for complex multi-project setups.

---

## Market Gap

| Tool | Non-tech intake | Auto executes | Reports back |
|------|----------------|---------------|-------------|
| Linear / Jira | partial | no | no |
| Devin / SWE-agent | no | yes | no |
| GitHub Copilot | no | dev drives it | no |
| Zapier / Make | yes | no code skills | no |
| **AgentInbox** | **yes** | **yes** | **yes** |

Nobody owns all three columns. Closest competitor is Devin at $500/month — but it has no client intake UI, no multi-project support, and no PM layer.

---

## Why This Wins

**The completion summary is the killer feature.** Every existing AI dev tool is a black box. AgentInbox writes back in plain English what was done, what changed, and what the PR number is. Non-technical clients can read it. PMs can forward it. That transparency builds trust nobody else is building.

**It feels like a chat app, but it ships code.** From the client's side: they type a message and get a reply. Familiar, zero learning curve. Under the hood: Claude is executing a full dev pipeline. The gap between how simple it feels and how much it does is the product.

**Project isolation is the enterprise feature.** Designed from day one for agencies running 10 projects for 10 clients with 10 different stacks. That is the market with real budget.

**MCP distribution is the developer adoption strategy.** Any Claude user connects in one line. No custom plugin, no new SDK. Same pattern they already use.

**Auth scales with trust needs.** End users get a link — zero friction. Enterprise teams get SSO. Nobody forced into more auth than they need.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Anthropic builds this natively | Go open source fast, own the "bring your own skills" niche |
| Agent pushes wrong code | Default PR-first, never direct push. PM approval gate available. |
| Non-technical UI too complex | Test with real non-technical users before every release |
| Link auth too weak for some | Tier 2 email OTP available, Tier 3 SSO for enterprise |
| Multi-project isolation breaks | Project tokens fully separate, zero shared state |
| Clients don't trust AI | Full audit log, PR-first default, plain-English explanation of every change |
| Agent can't solve a task | Escalation tool flags it — client sees "needs human review" not silence |

---

## The One-Line Pitch

> **AgentInbox: drop a bug or feature request, AI ships the fix, everyone sees what happened.**

For agencies: replaces the WhatsApp → PM → Dev → PM → Client chain with a single automated loop.
For developers: removes interrupt-driven work entirely.
For PMs: full visibility and optional control without touching code.
For clients: a professional portal where they submit work and watch it get done.

---

## Open Source Repository Structure

```
agentinbox/
├── packages/
│   ├── server/              # MCP server core (TypeScript)
│   │   ├── src/
│   │   │   ├── mcp/         # MCP tool definitions
│   │   │   ├── queue/       # Task queue logic
│   │   │   ├── files/       # File upload + parsing
│   │   │   ├── auth/        # Link tokens + email OTP
│   │   │   └── api/         # REST API for UI
│   │   └── package.json
│   │
│   └── ui/                  # Web UI (React)
│       ├── src/
│       │   ├── submit/      # Client submission form
│       │   ├── status/      # Live task status + summary
│       │   └── pm/          # PM dashboard
│       └── package.json
│
├── examples/
│   ├── basic-setup/         # Single project, one developer
│   └── multi-project/       # Agency with multiple clients
│
├── docs/
│   ├── getting-started.md
│   ├── mcp-tools.md
│   ├── authentication.md
│   └── multi-project.md
│
├── docker-compose.yml       # One command full stack
└── README.md
```

---

## Getting Started (future README)

```bash
# Install and run
npx agentinbox start

# Add to Claude MCP config
{
  "mcpServers": {
    "agentinbox": {
      "url": "http://localhost:3000/mcp"
    }
  }
}

# Open the UI — create your first project, get a submission link
http://localhost:3000

# Send the link to your client — that is all they need
agentinbox.io/submit/your-project-token
```

**That's it. Clients submit tasks. Claude handles them. Everyone sees what happened.**

---

## What We Are Not Building (v1 scope)

- A code editor or IDE plugin
- A replacement for GitHub / GitLab
- A general AI chat interface
- A project management tool (not Jira)
- Anything that requires the client to have technical knowledge

---

*Built on Anthropic's Model Context Protocol. Works with Claude Code, Claude Desktop, and any MCP-compatible Claude setup. Open source core, hosted SaaS for teams that don't want to self-host.*
