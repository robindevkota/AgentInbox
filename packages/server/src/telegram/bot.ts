import { db, nowUnix } from "../queue/db";
import { taskQueries } from "../queue/tasks";
import { emitTaskCreated } from "../socket/manager";
import { triggerClaude } from "../trigger/claude";

function getToken() { return process.env.TELEGRAM_BOT_TOKEN; }
function getChatId() { return process.env.TELEGRAM_CHAT_ID; }
function getApi() { const t = getToken(); return t ? `https://api.telegram.org/bot${t}` : null; }

let lastUpdateId = 0;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export async function sendTelegram(text: string, replyToMessageId?: number): Promise<number | null> {
  const API = getApi();
  const CHAT_ID = getChatId();
  if (!API || !CHAT_ID) return null;
  try {
    const body: Record<string, any> = {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
    };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    const res = await fetch(`${API}/sendMessage`, {
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

async function fetchUpdates(): Promise<void> {
  const API = getApi();
  const CHAT_ID = getChatId();
  if (!API || !CHAT_ID) return;
  try {
    const res = await fetch(`${API}/getUpdates?offset=${lastUpdateId + 1}&timeout=3`);
    if (!res.ok) return;
    const data = await res.json() as { ok: boolean; result: any[] };
    if (!data.ok || !data.result.length) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || String(msg.chat.id) !== String(CHAT_ID)) continue;

      const text: string = (msg.text || "").trim();
      const replyToId: number | undefined = msg.reply_to_message?.message_id;

      // New message (not a reply) — create a task from it
      if (!replyToId) {
        const projectId = process.env.TELEGRAM_PROJECT_ID;
        if (!projectId) continue;

        const project = taskQueries.getProjectById(projectId);
        if (!project) continue;

        const task = taskQueries.createTask({
          project_id: projectId,
          title: text.length > 80 ? text.slice(0, 77) + "..." : text,
          description: text,
          priority: "medium",
          submitter_name: "Developer (Telegram)",
        });

        const msgId = await sendTelegram(
          `⚡ <b>Task created:</b> ${task.title}\n\nClaude is on it.`,
          msg.message_id
        );
        if (msgId) {
          db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, task.id);
        }

        const workspace = taskQueries.getWorkspace(project.workspace_id);
        if (workspace) {
          emitTaskCreated(workspace.id, { task_id: task.id, title: task.title, project_id: projectId });
        }

        if (process.env.TRIGGER_CLAUDE === "true") triggerClaude();
        continue;
      }

      // Find task by telegram_message_id
      const task = db
        .prepare("SELECT * FROM tasks WHERE telegram_message_id = ?")
        .get(replyToId) as any;
      if (!task) continue;

      const lower = text.toLowerCase();

      // Handle approval replies
      if (task.status === "awaiting_approval") {
        if (lower === "approve" || lower === "yes") {
          taskQueries.approveTask(task.id, "Developer (Telegram)");
          taskQueries.audit({ task_id: task.id, action: "task_approved", actor: "Developer (Telegram)" });
          await sendTelegram(`✅ Approved! Claude is now executing the plan for: <b>${task.title}</b>`, replyToId);
        } else if (lower.startsWith("reject")) {
          const reason = text.slice(6).replace(/^[:\s]+/, "").trim() || "Rejected via Telegram";
          taskQueries.rejectTask(task.id, reason);
          taskQueries.audit({ task_id: task.id, action: "task_rejected", actor: "Developer (Telegram)", detail: reason });
          await sendTelegram(`❌ Rejected. Claude has been notified: "${reason}"`, replyToId);
        }
        continue;
      }

      // Handle developer_reply for ask_developer questions
      if (task.status === "in_progress" || task.status === "pending") {
        db.prepare("UPDATE tasks SET developer_reply = ?, updated_at = ? WHERE id = ?")
          .run(text, nowUnix(), task.id);
        await sendTelegram(`👍 Got it! Claude will continue with: "${text}"`, replyToId);
      }
    }
  } catch {
    // polling errors are non-fatal
  }
}

export function startTelegramPolling(): void {
  if (!getToken() || !getChatId()) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — Telegram disabled");
    return;
  }
  if (pollInterval) return;
  pollInterval = setInterval(fetchUpdates, 3000);
  console.log("[telegram] Polling started");
}

export function stopTelegramPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Notification helpers ────────────────────────────────────────────────────

export async function notifyTaskSubmitted(taskId: string, title: string, projectName: string): Promise<void> {
  const msgId = await sendTelegram(`🐛 <b>New bug:</b> ${title}\n<i>Project: ${projectName}</i>\n\nClaude is on it.`);
  if (msgId) {
    db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
  }
}

export async function notifyTaskDone(taskId: string, title: string): Promise<void> {
  await sendTelegram(`✅ <b>Fixed:</b> ${title}\n\nProof posted to dashboard.`);
}

export async function notifyTaskEscalated(taskId: string, title: string, reason: string): Promise<void> {
  await sendTelegram(`🚨 <b>Escalated:</b> ${title}\n\n<i>${reason}</i>\n\nNeeds your attention.`);
}

export async function notifyApprovalNeeded(taskId: string, title: string, plan: string): Promise<void> {
  const text = `⏳ <b>Approval needed:</b> ${title}\n\n<b>Claude's plan:</b>\n${plan}\n\n👆 <b>Long press this message → Reply</b>\nType <b>approve</b> or <b>reject: your reason</b>`;
  const msgId = await sendTelegram(text);
  if (msgId) {
    db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
  }
}

export async function askDeveloper(taskId: string, title: string, question: string): Promise<void> {
  const text = `❓ <b>Claude needs your input:</b>\n<i>${title}</i>\n\n${question}\n\n👆 <b>Long press this message → Reply</b> with your answer.\nClaude continues in 5 min if no reply.`;
  const msgId = await sendTelegram(text);
  if (msgId) {
    db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
  }
}
