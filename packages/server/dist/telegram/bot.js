"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegram = sendTelegram;
exports.startTelegramPolling = startTelegramPolling;
exports.stopTelegramPolling = stopTelegramPolling;
exports.notifyTaskSubmitted = notifyTaskSubmitted;
exports.notifyTaskDone = notifyTaskDone;
exports.notifyTaskEscalated = notifyTaskEscalated;
exports.notifyApprovalNeeded = notifyApprovalNeeded;
exports.askDeveloper = askDeveloper;
const db_1 = require("../queue/db");
const tasks_1 = require("../queue/tasks");
function getToken() { return process.env.TELEGRAM_BOT_TOKEN; }
function getChatId() { return process.env.TELEGRAM_CHAT_ID; }
function getApi() { const t = getToken(); return t ? `https://api.telegram.org/bot${t}` : null; }
let lastUpdateId = 0;
let pollInterval = null;
async function sendTelegram(text, replyToMessageId) {
    const API = getApi();
    const CHAT_ID = getChatId();
    if (!API || !CHAT_ID)
        return null;
    try {
        const body = {
            chat_id: CHAT_ID,
            text,
            parse_mode: "HTML",
        };
        if (replyToMessageId)
            body.reply_to_message_id = replyToMessageId;
        const res = await fetch(`${API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        return data.result?.message_id ?? null;
    }
    catch {
        return null;
    }
}
async function fetchUpdates() {
    const API = getApi();
    const CHAT_ID = getChatId();
    if (!API || !CHAT_ID)
        return;
    try {
        const res = await fetch(`${API}/getUpdates?offset=${lastUpdateId + 1}&timeout=3`);
        if (!res.ok)
            return;
        const data = await res.json();
        if (!data.ok || !data.result.length)
            return;
        for (const update of data.result) {
            lastUpdateId = update.update_id;
            const msg = update.message;
            if (!msg || String(msg.chat.id) !== String(CHAT_ID))
                continue;
            const text = (msg.text || "").trim();
            const replyToId = msg.reply_to_message?.message_id;
            if (!replyToId)
                continue;
            // Find task by telegram_message_id
            const task = db_1.db
                .prepare("SELECT * FROM tasks WHERE telegram_message_id = ?")
                .get(replyToId);
            if (!task)
                continue;
            const lower = text.toLowerCase();
            // Handle approval replies
            if (task.status === "awaiting_approval") {
                if (lower === "approve" || lower === "yes") {
                    tasks_1.taskQueries.approveTask(task.id, "Developer (Telegram)");
                    tasks_1.taskQueries.audit({ task_id: task.id, action: "task_approved", actor: "Developer (Telegram)" });
                    await sendTelegram(`✅ Approved! Claude is now executing the plan for: <b>${task.title}</b>`, replyToId);
                }
                else if (lower.startsWith("reject")) {
                    const reason = text.slice(6).replace(/^[:\s]+/, "").trim() || "Rejected via Telegram";
                    tasks_1.taskQueries.rejectTask(task.id, reason);
                    tasks_1.taskQueries.audit({ task_id: task.id, action: "task_rejected", actor: "Developer (Telegram)", detail: reason });
                    await sendTelegram(`❌ Rejected. Claude has been notified: "${reason}"`, replyToId);
                }
                continue;
            }
            // Handle developer_reply for ask_developer questions
            if (task.status === "in_progress" || task.status === "pending") {
                db_1.db.prepare("UPDATE tasks SET developer_reply = ?, updated_at = ? WHERE id = ?")
                    .run(text, (0, db_1.nowUnix)(), task.id);
                await sendTelegram(`👍 Got it! Claude will continue with: "${text}"`, replyToId);
            }
        }
    }
    catch {
        // polling errors are non-fatal
    }
}
function startTelegramPolling() {
    if (!getToken() || !getChatId()) {
        console.log("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — Telegram disabled");
        return;
    }
    if (pollInterval)
        return;
    pollInterval = setInterval(fetchUpdates, 3000);
    console.log("[telegram] Polling started");
}
function stopTelegramPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}
// ── Notification helpers ────────────────────────────────────────────────────
async function notifyTaskSubmitted(taskId, title, projectName) {
    const msgId = await sendTelegram(`🐛 <b>New bug:</b> ${title}\n<i>Project: ${projectName}</i>\n\nClaude is on it.`);
    if (msgId) {
        db_1.db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
    }
}
async function notifyTaskDone(taskId, title) {
    await sendTelegram(`✅ <b>Fixed:</b> ${title}\n\nProof posted to dashboard.`);
}
async function notifyTaskEscalated(taskId, title, reason) {
    await sendTelegram(`🚨 <b>Escalated:</b> ${title}\n\n<i>${reason}</i>\n\nNeeds your attention.`);
}
async function notifyApprovalNeeded(taskId, title, plan) {
    const text = `⏳ <b>Approval needed:</b> ${title}\n\n<b>Claude's plan:</b>\n${plan}\n\n👆 <b>Long press this message → Reply</b>\nType <b>approve</b> or <b>reject: your reason</b>`;
    const msgId = await sendTelegram(text);
    if (msgId) {
        db_1.db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
    }
}
async function askDeveloper(taskId, title, question) {
    const text = `❓ <b>Claude needs your input:</b>\n<i>${title}</i>\n\n${question}\n\n👆 <b>Long press this message → Reply</b> with your answer.\nClaude continues in 5 min if no reply.`;
    const msgId = await sendTelegram(text);
    if (msgId) {
        db_1.db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
    }
}
//# sourceMappingURL=bot.js.map