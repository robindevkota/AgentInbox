import { db, nowUnix } from "../queue/db";
import { taskQueries } from "../queue/tasks";
import { emitTaskCreated } from "../socket/manager";
import { triggerClaude } from "../trigger/claude";

// ── Message intent classifier ─────────────────────────────────────────────────
// Uses Claude API to decide if a Telegram message is a task or normal chat.

interface MessageIntent {
  type: "task" | "chat";
  title?: string;   // short task title if type=task
  reply?: string;   // reply text if type=chat
}

function classifyMessage(text: string): MessageIntent {
  const t = text.trim().toLowerCase();

  // Greetings and casual chat
  const chatPatterns = [
    /^(hey|hi|hello|howdy|sup|yo|hiya)[\s!?.]*$/,
    /^how are you/,
    /^what'?s up/,
    /^good (morning|afternoon|evening|night)/,
    /^(thanks|thank you|thx|cheers|ok|okay|cool|great|nice|awesome|got it|sounds good)/,
    /^(bye|goodbye|see you|cya|later)/,
    /^who are you/,
    /^what can you do/,
    /^help$/,
  ];

  for (const pattern of chatPatterns) {
    if (pattern.test(t)) {
      const replies: Record<string, string> = {
        greeting: "Hey! Send me a bug or task and I'll get Claude on it. 🤖",
        howAreyou: "All good — connected and ready to fix bugs! What do you need?",
        thanks: "Anytime! Send me the next one when ready. 🚀",
        bye: "Talk soon! I'll be here when the next bug arrives. 👋",
        help: "Send me any bug, feature request, or task — Claude will fix it automatically. Just describe what needs doing!",
      };

      if (/^(hey|hi|hello|howdy|sup|yo|hiya)/.test(t)) return { type: "chat", reply: replies.greeting };
      if (/how are you|what'?s up/.test(t)) return { type: "chat", reply: replies.howAreyou };
      if (/thanks|thank you|thx|cheers|ok|okay|cool|great|nice|awesome|got it|sounds good/.test(t)) return { type: "chat", reply: replies.thanks };
      if (/bye|goodbye|see you|cya|later/.test(t)) return { type: "chat", reply: replies.bye };
      if (/help/.test(t)) return { type: "chat", reply: replies.help };
      return { type: "chat", reply: "Got it! Send me a task whenever you're ready. 🤖" };
    }
  }

  // Everything else is a task — bug, feature, question about code, etc.
  const title = text.length > 80 ? text.slice(0, 77) + "..." : text;
  return { type: "task", title };
}

// ── Per-workspace Telegram polling ────────────────────────────────────────────
// Each workspace has its own bot token, chat ID, and project ID.
// Global env vars (TELEGRAM_BOT_TOKEN etc.) are used as fallback for the
// server owner's workspace only.

interface WorkspaceTelegram {
  workspaceId: string;
  botToken: string;
  chatId: string;
  projectId: string | null;
  lastUpdateId: number;
}

const activePollers = new Map<string, ReturnType<typeof setInterval>>();
const pollerState = new Map<string, WorkspaceTelegram>();

function apiUrl(botToken: string) {
  return `https://api.telegram.org/bot${botToken}`;
}

// ── Send a message ────────────────────────────────────────────────────────────

export async function sendTelegramToWorkspace(workspaceId: string, text: string, replyToMessageId?: number): Promise<number | null> {
  const cfg = taskQueries.getTelegramConfig(workspaceId);
  const botToken = cfg.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg.chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;
  return _send(botToken, chatId, text, replyToMessageId);
}

// Legacy: send using env vars (server owner only)
export async function sendTelegram(text: string, replyToMessageId?: number): Promise<number | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;
  return _send(botToken, chatId, text, replyToMessageId);
}

async function _send(botToken: string, chatId: string, text: string, replyToMessageId?: number): Promise<number | null> {
  try {
    const body: Record<string, any> = { chat_id: chatId, text, parse_mode: "HTML" };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    const res = await fetch(`${apiUrl(botToken)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; result?: { message_id: number } };
    return data.result?.message_id ?? null;
  } catch {
    return null;
  }
}

// ── Poll updates for one workspace ───────────────────────────────────────────

async function fetchUpdatesForWorkspace(ws: WorkspaceTelegram): Promise<void> {
  try {
    const res = await fetch(`${apiUrl(ws.botToken)}/getUpdates?offset=${ws.lastUpdateId + 1}&timeout=3`);
    if (!res.ok) return;
    const data = await res.json() as { ok: boolean; result: any[] };
    if (!data.ok || !data.result.length) return;

    for (const update of data.result) {
      ws.lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || String(msg.chat.id) !== String(ws.chatId)) continue;

      const text: string = (msg.text || "").trim();
      const replyToId: number | undefined = msg.reply_to_message?.message_id;

      // New message (not a reply) — classify then act
      if (!replyToId) {
        const intent = await classifyMessage(text);

        // Normal conversation — just reply, no task
        if (intent.type === "chat") {
          await _send(ws.botToken, ws.chatId, intent.reply!, msg.message_id);
          continue;
        }

        // Task (bug / feature / anything actionable)
        if (!ws.projectId) {
          await _send(ws.botToken, ws.chatId, "⚠️ No project configured for Telegram tasks. Set one in your PM dashboard → Settings → Telegram.", msg.message_id);
          continue;
        }

        const project = taskQueries.getProjectById(ws.projectId);
        if (!project) continue;

        const task = taskQueries.createTask({
          project_id: ws.projectId,
          title: intent.title || (text.length > 80 ? text.slice(0, 77) + "..." : text),
          description: text,
          priority: "medium",
          submitter_name: "Developer (Telegram)",
        });

        const msgId = await _send(ws.botToken, ws.chatId, `⚡ <b>Task created:</b> ${task.title}\n\nClaude is on it.`, msg.message_id);
        if (msgId) {
          db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, task.id);
        }

        emitTaskCreated(ws.workspaceId, { task_id: task.id, title: task.title, project_id: ws.projectId });
        if (process.env.TRIGGER_CLAUDE === "true") triggerClaude();
        continue;
      }

      // Reply to a bot message — find the task by telegram_message_id
      const task = db.prepare("SELECT * FROM tasks WHERE telegram_message_id = ?").get(replyToId) as any;
      if (!task) continue;

      const lower = text.toLowerCase();

      if (task.status === "awaiting_approval") {
        if (lower === "approve" || lower === "yes") {
          taskQueries.approveTask(task.id, "Developer (Telegram)");
          taskQueries.audit({ task_id: task.id, action: "task_approved", actor: "Developer (Telegram)" });
          await _send(ws.botToken, ws.chatId, `✅ Approved! Claude is executing the plan for: <b>${task.title}</b>`, replyToId);
        } else if (lower.startsWith("reject")) {
          const reason = text.slice(6).replace(/^[:\s]+/, "").trim() || "Rejected via Telegram";
          taskQueries.rejectTask(task.id, reason);
          taskQueries.audit({ task_id: task.id, action: "task_rejected", actor: "Developer (Telegram)", detail: reason });
          await _send(ws.botToken, ws.chatId, `❌ Rejected. Claude has been notified: "${reason}"`, replyToId);
        }
        continue;
      }

      if (task.status === "in_progress" || task.status === "pending") {
        db.prepare("UPDATE tasks SET developer_reply = ?, updated_at = ? WHERE id = ?").run(text, nowUnix(), task.id);
        await _send(ws.botToken, ws.chatId, `👍 Got it! Claude will continue with: "${text}"`, replyToId);
      }
    }
  } catch {
    // polling errors are non-fatal
  }
}

// ── Start/stop polling per workspace ─────────────────────────────────────────

function startPollerForWorkspace(workspaceId: string, botToken: string, chatId: string, projectId: string | null): void {
  if (activePollers.has(workspaceId)) return;
  const ws: WorkspaceTelegram = { workspaceId, botToken, chatId, projectId, lastUpdateId: 0 };
  pollerState.set(workspaceId, ws);
  const interval = setInterval(() => fetchUpdatesForWorkspace(ws), 3000);
  activePollers.set(workspaceId, interval);
  console.log(`[telegram] Started poller for workspace ${workspaceId}`);
}

function stopPollerForWorkspace(workspaceId: string): void {
  const interval = activePollers.get(workspaceId);
  if (interval) {
    clearInterval(interval);
    activePollers.delete(workspaceId);
    pollerState.delete(workspaceId);
  }
}

export function refreshPollerForWorkspace(workspaceId: string): void {
  stopPollerForWorkspace(workspaceId);
  const cfg = taskQueries.getTelegramConfig(workspaceId);
  if (cfg.bot_token && cfg.chat_id) {
    startPollerForWorkspace(workspaceId, cfg.bot_token, cfg.chat_id, cfg.project_id);
  }
}

// ── Bootstrap — start pollers for all configured workspaces ──────────────────

export function startTelegramPolling(): void {
  // Start per-workspace pollers from DB config
  const workspaces = taskQueries.getAllWorkspacesWithTelegram();
  for (const ws of workspaces) {
    startPollerForWorkspace(ws.id, ws.telegram_bot_token, ws.telegram_chat_id, ws.telegram_project_id || null);
  }

  // Fallback: env vars for server owner's workspace (backward compat)
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  const envChatId = process.env.TELEGRAM_CHAT_ID;
  const envProjectId = process.env.TELEGRAM_PROJECT_ID || null;
  const envWsId = process.env.SEED_WORKSPACE_ID || "robin-workspace-001";
  if (envToken && envChatId && !activePollers.has(envWsId)) {
    startPollerForWorkspace(envWsId, envToken, envChatId, envProjectId);
  }

  if (activePollers.size === 0) {
    console.log("[telegram] No Telegram config found — Telegram disabled");
  }
}

export function stopTelegramPolling(): void {
  for (const workspaceId of activePollers.keys()) {
    stopPollerForWorkspace(workspaceId);
  }
}

// ── Notification helpers ──────────────────────────────────────────────────────

async function getWorkspaceIdForTask(taskId: string): Promise<string | null> {
  const row = db.prepare(`
    SELECT p.workspace_id FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(taskId) as { workspace_id: string } | null;
  return row?.workspace_id ?? null;
}

export async function notifyTaskSubmitted(taskId: string, title: string, projectName: string): Promise<void> {
  const wsId = await getWorkspaceIdForTask(taskId);
  const cfg = wsId ? taskQueries.getTelegramConfig(wsId) : null;
  const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  const msgId = await _send(botToken, chatId, `🐛 <b>New bug:</b> ${title}\n<i>Project: ${projectName}</i>\n\nClaude is on it.`);
  if (msgId) db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
}

export async function notifyTaskDone(taskId: string, title: string): Promise<void> {
  const wsId = await getWorkspaceIdForTask(taskId);
  const cfg = wsId ? taskQueries.getTelegramConfig(wsId) : null;
  const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  await _send(botToken, chatId, `✅ <b>Fixed:</b> ${title}\n\nProof posted to dashboard.`);
}

export async function notifyTaskEscalated(taskId: string, title: string, reason: string): Promise<void> {
  const wsId = await getWorkspaceIdForTask(taskId);
  const cfg = wsId ? taskQueries.getTelegramConfig(wsId) : null;
  const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  await _send(botToken, chatId, `🚨 <b>Escalated:</b> ${title}\n\n<i>${reason}</i>\n\nNeeds your attention.`);
}

export async function notifyApprovalNeeded(taskId: string, title: string, plan: string): Promise<void> {
  const wsId = await getWorkspaceIdForTask(taskId);
  const cfg = wsId ? taskQueries.getTelegramConfig(wsId) : null;
  const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  const text = `⏳ <b>Approval needed:</b> ${title}\n\n<b>Claude's plan:</b>\n${plan}\n\n👆 <b>Reply:</b> <b>approve</b> or <b>reject: your reason</b>`;
  const msgId = await _send(botToken, chatId, text);
  if (msgId) db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
}

export async function askDeveloper(taskId: string, title: string, question: string): Promise<void> {
  const wsId = await getWorkspaceIdForTask(taskId);
  const cfg = wsId ? taskQueries.getTelegramConfig(wsId) : null;
  const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  const text = `❓ <b>Claude needs input:</b>\n<i>${title}</i>\n\n${question}\n\n👆 <b>Reply</b> with your answer. Claude continues in 5 min if no reply.`;
  const msgId = await _send(botToken, chatId, text);
  if (msgId) db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
}
