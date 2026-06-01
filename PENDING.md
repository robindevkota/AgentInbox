# AgentInbox — Pending Tasks (next session)

## 🔴 Do First

### 1. Turn Cloudflare proxy back to orange
Both `useagentinbox.com` and `www.useagentinbox.com` records need orange cloud (Proxied) in Cloudflare DNS — wait until Render shows Certificate Active (green) first.

### 2. Deploy to Render
Push triggered automatically on git push — verify latest build is live at `https://useagentinbox.com`. Check the animation, setup guide download, and workspace token in Settings all work on the live URL.

### 3. Stripe billing
The only thing blocking revenue. Nothing else matters until this is done.

**What to build:**
- `POST /api/billing/checkout` → Stripe Checkout session
- Webhook: `checkout.session.completed` → set workspace `plan` + `plan_expires_at`
- Webhook: `customer.subscription.deleted` → downgrade to free
- Flip `BILLING_ENABLED=true` in Render env vars after testing

Already built that makes this easy:
- `plan` column on workspaces (`free`, `starter`, `growth`, `pro`)
- `FREE_TASK_LIMIT = 50` enforcement in routes.ts
- Upgrade banner already renders in UI when limit hit
- `BILLING_ENABLED` env var toggle

---

## 🟡 After Stripe

### 4. Show HN post
- Title: "AgentInbox – clients submit bugs, your Claude Code session fixes them, everyone sees proof"
- Post at: `https://useagentinbox.com`
- Mention: Claude Pro as free API angle, 8-line setup, setup file download
- Also post: r/ClaudeAI, r/SideProject

### 5. Outbound Slack webhook
When a task is done → POST to developer's Slack channel. 1 day build. Makes AgentInbox sticky and hard to cancel.

### 6. SLA/stats dashboard
Average fix time, completion rate, escalation % per workspace. 2 hours of SQL. The renewal justification a VP needs to approve a purchase order.

---

## 🟢 Backlog (post first paying customer)

See `BACKLOG.md` for:
- Mobile notifications (Telegram/WhatsApp)
- Third-party integrations (Jira/GitLab)

---

## Domain

- `useagentinbox.com` — purchased Jun 2, 2026, expires Jun 2, 2027
- Hosted on Render, DNS on Cloudflare
- Both records currently DNS only (grey) — turn orange after certs go green
