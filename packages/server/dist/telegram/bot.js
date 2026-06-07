"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramToWorkspace = sendTelegramToWorkspace;
exports.sendTelegram = sendTelegram;
exports.refreshPollerForWorkspace = refreshPollerForWorkspace;
exports.startTelegramPolling = startTelegramPolling;
exports.stopTelegramPolling = stopTelegramPolling;
exports.notifyTaskSubmitted = notifyTaskSubmitted;
exports.notifyTaskDone = notifyTaskDone;
exports.notifyTaskEscalated = notifyTaskEscalated;
exports.notifyApprovalNeeded = notifyApprovalNeeded;
exports.askDeveloper = askDeveloper;
const db_1 = require("../queue/db");
const tasks_1 = require("../queue/tasks");
const manager_1 = require("../socket/manager");
const claude_1 = require("../trigger/claude");
function classifyMessage(text) {
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
            const replies = {
                greeting: "Hey! Send me a bug or task and I'll get Claude on it. 🤖",
                howAreyou: "All good — connected and ready to fix bugs! What do you need?",
                thanks: "Anytime! Send me the next one when ready. 🚀",
                bye: "Talk soon! I'll be here when the next bug arrives. 👋",
                help: "Send me any bug, feature request, or task — Claude will fix it automatically. Just describe what needs doing!",
            };
            if (/^(hey|hi|hello|howdy|sup|yo|hiya)/.test(t))
                return { type: "chat", reply: replies.greeting };
            if (/how are you|what'?s up/.test(t))
                return { type: "chat", reply: replies.howAreyou };
            if (/thanks|thank you|thx|cheers|ok|okay|cool|great|nice|awesome|got it|sounds good/.test(t))
                return { type: "chat", reply: replies.thanks };
            if (/bye|goodbye|see you|cya|later/.test(t))
                return { type: "chat", reply: replies.bye };
            if (/help/.test(t))
                return { type: "chat", reply: replies.help };
            return { type: "chat", reply: "Got it! Send me a task whenever you're ready. 🤖" };
        }
    }
    // Everything else is a task — bug, feature, question about code, etc.
    const title = text.length > 80 ? text.slice(0, 77) + "..." : text;
    return { type: "task", title };
}
const activePollers = new Map();
const pollerState = new Map();
function apiUrl(botToken) {
    return `https://api.telegram.org/bot${botToken}`;
}
// ── Send a message ────────────────────────────────────────────────────────────
async function sendTelegramToWorkspace(workspaceId, text, replyToMessageId) {
    const cfg = tasks_1.taskQueries.getTelegramConfig(workspaceId);
    const botToken = cfg.bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = cfg.chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId)
        return null;
    return _send(botToken, chatId, text, replyToMessageId);
}
// Legacy: send using env vars (server owner only)
async function sendTelegram(text, replyToMessageId) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId)
        return null;
    return _send(botToken, chatId, text, replyToMessageId);
}
async function _send(botToken, chatId, text, replyToMessageId) {
    try {
        const body = { chat_id: chatId, text, parse_mode: "HTML" };
        if (replyToMessageId)
            body.reply_to_message_id = replyToMessageId;
        const res = await fetch(`${apiUrl(botToken)}/sendMessage`, {
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
async function _sendPhoto(botToken, chatId, screenshotBase64, caption) {
    try {
        const buf = Buffer.from(screenshotBase64, "base64");
        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("caption", caption);
        formData.append("parse_mode", "HTML");
        formData.append("photo", new Blob([buf], { type: "image/png" }), "screenshot.png");
        await fetch(`${apiUrl(botToken)}/sendPhoto`, { method: "POST", body: formData });
    }
    catch {
        // ignore
    }
}
// ── Poll updates for one workspace ───────────────────────────────────────────
async function _downloadTelegramFile(botToken, fileId) {
    try {
        const res = await fetch(`${apiUrl(botToken)}/getFile?file_id=${fileId}`);
        if (!res.ok)
            return null;
        const info = await res.json();
        if (!info.ok || !info.result?.file_path)
            return null;
        const filePath = info.result.file_path;
        const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
        if (!fileRes.ok)
            return null;
        const buf = Buffer.from(await fileRes.arrayBuffer());
        const name = filePath.split("/").pop() || "attachment";
        const data = buf.toString("base64");
        // Best-effort text extraction for markdown/text files
        let content = "";
        if (name.match(/\.(md|txt|json|csv|js|ts|py|html|css)$/i)) {
            content = buf.toString("utf-8").slice(0, 10000);
        }
        else {
            content = `[Attached file: ${name}]`;
        }
        return { data, name, content };
    }
    catch {
        return null;
    }
}
async function fetchUpdatesForWorkspace(ws) {
    try {
        const res = await fetch(`${apiUrl(ws.botToken)}/getUpdates?offset=${ws.lastUpdateId + 1}&timeout=3`);
        if (!res.ok)
            return;
        const data = await res.json();
        if (!data.ok || !data.result.length)
            return;
        for (const update of data.result) {
            ws.lastUpdateId = update.update_id;
            const msg = update.message;
            if (!msg || String(msg.chat.id) !== String(ws.chatId))
                continue;
            const text = (msg.text || msg.caption || "").trim();
            const replyToId = msg.reply_to_message?.message_id;
            // New message (not a reply) — classify then act
            if (!replyToId) {
                // Detect attached file — photo or document
                let attachment = null;
                if (msg.photo) {
                    // photo is array — last entry is highest resolution
                    const fileId = msg.photo[msg.photo.length - 1].file_id;
                    attachment = await _downloadTelegramFile(ws.botToken, fileId);
                    if (attachment)
                        attachment.name = "photo.jpg";
                }
                else if (msg.document) {
                    attachment = await _downloadTelegramFile(ws.botToken, msg.document.file_id);
                    if (attachment)
                        attachment.name = msg.document.file_name || attachment.name;
                }
                // If message has photo/document, always treat as task regardless of text
                const hasAttachment = !!(msg.photo || msg.document);
                const messageText = text || (hasAttachment ? `Attached file: ${attachment?.name || "photo"}` : "");
                const intent = await classifyMessage(messageText);
                // Normal conversation — just reply, no task (only if no attachment)
                if (intent.type === "chat" && !hasAttachment) {
                    await _send(ws.botToken, ws.chatId, intent.reply, msg.message_id);
                    continue;
                }
                // Task (bug / feature / anything actionable)
                if (!ws.projectId) {
                    await _send(ws.botToken, ws.chatId, "⚠️ No project configured for Telegram tasks. Set one in your PM dashboard → Settings → Telegram.", msg.message_id);
                    continue;
                }
                const project = tasks_1.taskQueries.getProjectById(ws.projectId);
                if (!project)
                    continue;
                const task = tasks_1.taskQueries.createTask({
                    project_id: ws.projectId,
                    title: intent.title || (messageText.length > 80 ? messageText.slice(0, 77) + "..." : messageText),
                    description: messageText,
                    priority: "medium",
                    submitter_name: "Developer (Telegram)",
                    ...(attachment ? { file_name: attachment.name, file_data: attachment.data, file_content: attachment.content } : {}),
                });
                const msgId = await _send(ws.botToken, ws.chatId, `⚡ <b>Task created:</b> ${task.title}\n\nClaude is on it.`, msg.message_id);
                if (msgId) {
                    db_1.db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, task.id);
                }
                (0, manager_1.emitTaskCreated)(ws.workspaceId, { task_id: task.id, title: task.title, project_id: ws.projectId });
                if (process.env.TRIGGER_CLAUDE === "true")
                    (0, claude_1.triggerClaude)();
                continue;
            }
            // Reply to a bot message — find the task by telegram_message_id
            const task = db_1.db.prepare("SELECT * FROM tasks WHERE telegram_message_id = ?").get(replyToId);
            if (!task)
                continue;
            const lower = text.toLowerCase();
            if (task.status === "awaiting_approval") {
                if (lower === "approve" || lower === "yes") {
                    tasks_1.taskQueries.approveTask(task.id, "Developer (Telegram)");
                    tasks_1.taskQueries.audit({ task_id: task.id, action: "task_approved", actor: "Developer (Telegram)" });
                    await _send(ws.botToken, ws.chatId, `✅ Approved! Claude is executing the plan for: <b>${task.title}</b>`, replyToId);
                }
                else if (lower.startsWith("reject")) {
                    const reason = text.slice(6).replace(/^[:\s]+/, "").trim() || "Rejected via Telegram";
                    tasks_1.taskQueries.rejectTask(task.id, reason);
                    tasks_1.taskQueries.audit({ task_id: task.id, action: "task_rejected", actor: "Developer (Telegram)", detail: reason });
                    await _send(ws.botToken, ws.chatId, `❌ Rejected. Claude has been notified: "${reason}"`, replyToId);
                }
                continue;
            }
            if (task.status === "in_progress" || task.status === "pending") {
                db_1.db.prepare("UPDATE tasks SET developer_reply = ?, updated_at = ? WHERE id = ?").run(text, (0, db_1.nowUnix)(), task.id);
                await _send(ws.botToken, ws.chatId, `👍 Got it! Claude will continue with: "${text}"`, replyToId);
            }
        }
    }
    catch {
        // polling errors are non-fatal
    }
}
// ── Start/stop polling per workspace ─────────────────────────────────────────
async function getLatestUpdateId(botToken) {
    try {
        const res = await fetch(`${apiUrl(botToken)}/getUpdates?limit=100&timeout=0`);
        if (!res.ok)
            return 0;
        const data = await res.json();
        if (!data.ok || !data.result.length)
            return 0;
        return data.result[data.result.length - 1].update_id;
    }
    catch {
        return 0;
    }
}
function startPollerForWorkspace(workspaceId, botToken, chatId, projectId) {
    if (activePollers.has(workspaceId))
        return;
    const ws = { workspaceId, botToken, chatId, projectId, lastUpdateId: 0 };
    pollerState.set(workspaceId, ws);
    // Fast-forward offset on startup so we don't reprocess old messages after a restart
    getLatestUpdateId(botToken).then(latestId => {
        ws.lastUpdateId = latestId;
        console.log(`[telegram] Poller for ${workspaceId} starting at update_id ${latestId}`);
    });
    const interval = setInterval(() => fetchUpdatesForWorkspace(ws), 3000);
    activePollers.set(workspaceId, interval);
    console.log(`[telegram] Started poller for workspace ${workspaceId}`);
}
function stopPollerForWorkspace(workspaceId) {
    const interval = activePollers.get(workspaceId);
    if (interval) {
        clearInterval(interval);
        activePollers.delete(workspaceId);
        pollerState.delete(workspaceId);
    }
}
function refreshPollerForWorkspace(workspaceId) {
    stopPollerForWorkspace(workspaceId);
    const cfg = tasks_1.taskQueries.getTelegramConfig(workspaceId);
    if (cfg.bot_token && cfg.chat_id) {
        startPollerForWorkspace(workspaceId, cfg.bot_token, cfg.chat_id, cfg.project_id);
    }
}
// ── Bootstrap — start pollers for all configured workspaces ──────────────────
function startTelegramPolling() {
    // Start per-workspace pollers from DB config
    const workspaces = tasks_1.taskQueries.getAllWorkspacesWithTelegram();
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
function stopTelegramPolling() {
    for (const workspaceId of activePollers.keys()) {
        stopPollerForWorkspace(workspaceId);
    }
}
// ── Notification helpers ──────────────────────────────────────────────────────
async function getWorkspaceIdForTask(taskId) {
    const row = db_1.db.prepare(`
    SELECT p.workspace_id FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(taskId);
    return row?.workspace_id ?? null;
}
async function notifyTaskSubmitted(taskId, title, projectName, description) {
    const wsId = await getWorkspaceIdForTask(taskId);
    const cfg = wsId ? tasks_1.taskQueries.getTelegramConfig(wsId) : null;
    const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId)
        return;
    const prefix = description?.match(/^\[(BUG|FEATURE|OTHER)\]/i)?.[1]?.toUpperCase();
    const label = prefix === "FEATURE" ? "✨ <b>New feature:</b>"
        : prefix === "OTHER" ? "💬 <b>New request:</b>"
            : "🐛 <b>New bug:</b>";
    const msgId = await _send(botToken, chatId, `${label} ${title}\n<i>Project: ${projectName}</i>\n\nClaude is on it.`);
    if (msgId)
        db_1.db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
}
async function notifyTaskDone(taskId, title) {
    const wsId = await getWorkspaceIdForTask(taskId);
    const cfg = wsId ? tasks_1.taskQueries.getTelegramConfig(wsId) : null;
    const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId)
        return;
    const task = tasks_1.taskQueries.getTask(taskId);
    const reply = task?.summary_plain ? `✅ <b>Done:</b> ${title}\n\n${task.summary_plain}` : `✅ <b>Done:</b> ${title}`;
    if (task?.screenshot_base64) {
        await _sendPhoto(botToken, chatId, task.screenshot_base64, reply);
    }
    else {
        await _send(botToken, chatId, reply);
    }
}
async function notifyTaskEscalated(taskId, title, reason) {
    const wsId = await getWorkspaceIdForTask(taskId);
    const cfg = wsId ? tasks_1.taskQueries.getTelegramConfig(wsId) : null;
    const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId)
        return;
    await _send(botToken, chatId, `🚨 <b>Escalated:</b> ${title}\n\n<i>${reason}</i>\n\nNeeds your attention.`);
}
async function notifyApprovalNeeded(taskId, title, plan) {
    const wsId = await getWorkspaceIdForTask(taskId);
    const cfg = wsId ? tasks_1.taskQueries.getTelegramConfig(wsId) : null;
    const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId)
        return;
    const text = `⏳ <b>Approval needed:</b> ${title}\n\n<b>Claude's plan:</b>\n${plan}\n\n👆 <b>Reply:</b> <b>approve</b> or <b>reject: your reason</b>`;
    const msgId = await _send(botToken, chatId, text);
    if (msgId)
        db_1.db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
}
async function askDeveloper(taskId, title, question) {
    const wsId = await getWorkspaceIdForTask(taskId);
    const cfg = wsId ? tasks_1.taskQueries.getTelegramConfig(wsId) : null;
    const botToken = cfg?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = cfg?.chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId)
        return;
    const text = `❓ <b>Claude needs input:</b>\n<i>${title}</i>\n\n${question}\n\n👆 <b>Reply</b> with your answer. Claude continues in 5 min if no reply.`;
    const msgId = await _send(botToken, chatId, text);
    if (msgId)
        db_1.db.prepare("UPDATE tasks SET telegram_message_id = ? WHERE id = ?").run(msgId, taskId);
}
//# sourceMappingURL=bot.js.map