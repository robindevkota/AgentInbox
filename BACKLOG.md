# AgentInbox — Feature Backlog

Features confirmed as valuable, deferred until first paying customers.

---

## 1. Mobile notifications — Telegram / WhatsApp

**What:** When a bug arrives, developer gets a message on Telegram or WhatsApp:
> "🐛 New bug: Login button broken on mobile. Claude is on it."

**Two-way conversation:** Claude can ask the developer a question mid-task:
> "Should I fix this in UAT or Live environment?"
Developer replies from phone → Claude reads reply → proceeds.

**Mobile approval gate:** Instead of approving in the PM dashboard:
> "Claude wants to push this fix to production. Reply YES to approve."
Developer replies YES from phone → Claude executes.

**Why it matters:** Kills the biggest objection to autonomous agents — "what if I'm not at my desk?" Developer can be anywhere, still in control.

**What to build:**
- Telegram Bot API integration (easier than WhatsApp — no business account needed)
- WhatsApp Business API as second option
- New MCP tool: `ask_developer(question)` — Claude calls this when it needs input
- Developer registers phone number in Settings
- Notification types: bug received, Claude asking question, approval request, fix done

**Effort:** ~3 days
**Build after:** First 3 paying customers

---

## 2. Third-party integrations (Jira / GitLab / Linear / WhatsApp)

**What:** Developer pastes their GitLab/Jira access token in Settings. AgentInbox routes bugs from those platforms directly into Claude.

**CTO note:** GitLab MCP, Jira MCP, Linear MCP already exist. Claude can use them alongside `agentinbox-mcp` in the same session — no extra engineering needed on our side. Document this as a supported pattern, don't build it. Only build a native integration if 3+ customers specifically request one platform.

**Effort:** 0 (documentation) or 1-2 weeks per native integration
**Build after:** Customer demand confirmed

---

## Priority rule

Do not touch this backlog until Stripe is live and at least 1 paying customer exists. Manual token issuance works for the first 5 customers. Don't over-engineer before revenue.
