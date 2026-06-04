"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskQueries = void 0;
const db_1 = require("./db");
const nanoid_1 = require("nanoid");
exports.taskQueries = {
    // ── Workspaces ────────────────────────────────────────────────────────────
    createWorkspace(name) {
        const id = (0, nanoid_1.nanoid)();
        db_1.db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run(id, name);
        return db_1.db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
    },
    getWorkspace(id) {
        return db_1.db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
    },
    // ── Projects ──────────────────────────────────────────────────────────────
    createProject(workspaceId, name, description, options) {
        const id = (0, nanoid_1.nanoid)();
        const token = (0, nanoid_1.nanoid)(32);
        db_1.db.prepare(`
      INSERT INTO projects (id, workspace_id, name, description, token, require_approval, allowed_emails, notify_email, brand_name, brand_color, slack_channel, custom_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, name, description ?? null, token, options?.require_approval ? 1 : 0, options?.allowed_emails ?? null, options?.notify_email ?? null, options?.brand_name ?? null, options?.brand_color ?? null, options?.slack_channel ?? null, options?.custom_fields ?? null);
        return db_1.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    },
    updateProject(id, updates) {
        const fields = Object.entries(updates)
            .map(([k]) => `${k} = ?`)
            .join(", ");
        const values = Object.values(updates).map((v) => typeof v === "boolean" ? (v ? 1 : 0) : v);
        db_1.db.prepare(`UPDATE projects SET ${fields} WHERE id = ?`).run(...values, id);
        return db_1.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    },
    deleteProject(id) {
        const result = db_1.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
        return result.changes > 0;
    },
    deleteTask(id) {
        db_1.db.prepare("DELETE FROM audit_log WHERE task_id = ?").run(id);
        const result = db_1.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
        return result.changes > 0;
    },
    getProjectByToken(token) {
        return db_1.db.prepare("SELECT * FROM projects WHERE token = ?").get(token);
    },
    getProjectById(id) {
        return db_1.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    },
    listProjects(workspaceId) {
        return db_1.db
            .prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC")
            .all(workspaceId);
    },
    // ── Tasks ─────────────────────────────────────────────────────────────────
    createTask(data) {
        const id = (0, nanoid_1.nanoid)();
        db_1.db.prepare(`
      INSERT INTO tasks (id, project_id, title, description, priority, submitter_name, submitter_email, file_path, file_name, file_content, file_data, custom_field_values)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.project_id, data.title, data.description, data.priority ?? "medium", data.submitter_name ?? null, data.submitter_email ?? null, data.file_path ?? null, data.file_name ?? null, data.file_content ?? null, data.file_data ?? null, data.custom_field_values ?? null);
        return db_1.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    },
    getTask(id) {
        return db_1.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    },
    getPendingTasks(projectId) {
        const order = "ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at ASC";
        if (projectId) {
            return db_1.db
                .prepare(`SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ${order}`)
                .all(projectId);
        }
        return db_1.db
            .prepare(`SELECT * FROM tasks WHERE status = 'pending' ${order}`)
            .all();
    },
    getApprovedTasks(projectId) {
        if (projectId) {
            return db_1.db
                .prepare("SELECT * FROM tasks WHERE project_id = ? AND status IN ('pending','in_progress') AND (approved_at IS NOT NULL OR project_id NOT IN (SELECT id FROM projects WHERE require_approval = 1)) ORDER BY created_at ASC")
                .all(projectId);
        }
        return db_1.db
            .prepare("SELECT * FROM tasks WHERE status IN ('pending','in_progress') ORDER BY created_at ASC")
            .all();
    },
    updateStatus(id, status) {
        db_1.db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, (0, db_1.nowUnix)(), id);
        return exports.taskQueries.getTask(id);
    },
    proposePlan(id, plan) {
        db_1.db.prepare("UPDATE tasks SET status = 'awaiting_approval', proposed_plan = ?, updated_at = ? WHERE id = ?").run(plan, (0, db_1.nowUnix)(), id);
        return exports.taskQueries.getTask(id);
    },
    approveTask(id, approvedBy) {
        db_1.db.prepare("UPDATE tasks SET status = 'in_progress', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?").run((0, db_1.nowUnix)(), approvedBy, (0, db_1.nowUnix)(), id);
        return exports.taskQueries.getTask(id);
    },
    rejectTask(id, reason) {
        db_1.db.prepare("UPDATE tasks SET status = 'pending', rejected_at = ?, rejected_reason = ?, updated_at = ? WHERE id = ?").run((0, db_1.nowUnix)(), reason, (0, db_1.nowUnix)(), id);
        return exports.taskQueries.getTask(id);
    },
    completeTask(id, summaryTechnical, summaryPlain, prLink, screenshotBase64) {
        db_1.db.prepare(`
      UPDATE tasks SET status = 'done', summary_technical = ?, summary_plain = ?, pr_link = ?, screenshot_base64 = ?, updated_at = ?
      WHERE id = ?
    `).run(summaryTechnical, summaryPlain, prLink ?? null, screenshotBase64 ?? null, (0, db_1.nowUnix)(), id);
        return exports.taskQueries.getTask(id);
    },
    reopenTask(id) {
        db_1.db.prepare("UPDATE tasks SET status = 'pending', updated_at = ? WHERE id = ?").run((0, db_1.nowUnix)(), id);
        return exports.taskQueries.getTask(id);
    },
    markSubmitterNotified(id) {
        db_1.db.prepare("UPDATE tasks SET submitter_notified_at = ? WHERE id = ?").run((0, db_1.nowUnix)(), id);
    },
    // ── Comments ──────────────────────────────────────────────────────────────
    addComment(taskId, author, body) {
        const id = (0, nanoid_1.nanoid)();
        db_1.db.prepare("INSERT INTO task_comments (id, task_id, author, body) VALUES (?, ?, ?, ?)").run(id, taskId, author, body);
        return db_1.db.prepare("SELECT * FROM task_comments WHERE id = ?").get(id);
    },
    getComments(taskId) {
        return db_1.db
            .prepare("SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC")
            .all(taskId);
    },
    escalateTask(id, reason) {
        db_1.db.prepare("UPDATE tasks SET status = 'escalated', escalation_reason = ?, updated_at = ? WHERE id = ?").run(reason, (0, db_1.nowUnix)(), id);
        return exports.taskQueries.getTask(id);
    },
    setSlackTs(id, slackTs) {
        db_1.db.prepare("UPDATE tasks SET slack_ts = ? WHERE id = ?").run(slackTs, id);
    },
    listTasks(projectId, status) {
        if (status) {
            return db_1.db
                .prepare("SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY created_at DESC")
                .all(projectId, status);
        }
        return db_1.db
            .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC")
            .all(projectId);
    },
    // ── OTP ───────────────────────────────────────────────────────────────────
    createOtp(projectId, email) {
        const id = (0, nanoid_1.nanoid)();
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = (0, db_1.nowUnix)() + 10 * 60; // 10 minutes
        db_1.db.prepare("INSERT INTO otp_tokens (id, project_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?)").run(id, projectId, email, token, expiresAt);
        return token;
    },
    verifyOtp(projectId, email, token) {
        const row = db_1.db
            .prepare("SELECT * FROM otp_tokens WHERE project_id = ? AND email = ? AND token = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1")
            .get(projectId, email, token, (0, db_1.nowUnix)());
        if (!row)
            return false;
        db_1.db.prepare("UPDATE otp_tokens SET used_at = ? WHERE id = ?").run((0, db_1.nowUnix)(), row.id);
        return true;
    },
    // ── Audit log ─────────────────────────────────────────────────────────────
    audit(entry) {
        db_1.db.prepare(`
      INSERT INTO audit_log (id, workspace_id, project_id, task_id, action, actor, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run((0, nanoid_1.nanoid)(), entry.workspace_id ?? null, entry.project_id ?? null, entry.task_id ?? null, entry.action, entry.actor ?? null, entry.detail ?? null);
    },
    getAuditLog(taskId) {
        return db_1.db
            .prepare("SELECT * FROM audit_log WHERE task_id = ? ORDER BY created_at ASC")
            .all(taskId);
    },
    // ── Usage stats ───────────────────────────────────────────────────────────
    getWorkspaceStats(workspaceId) {
        const stats = db_1.db
            .prepare(`
        SELECT
          COUNT(*) as total_tasks,
          SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done,
          SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN t.status = 'escalated' THEN 1 ELSE 0 END) as escalated
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE p.workspace_id = ?
      `)
            .get(workspaceId);
        const projectCount = db_1.db
            .prepare("SELECT COUNT(*) as n FROM projects WHERE workspace_id = ?")
            .get(workspaceId).n;
        return {
            total_tasks: stats["total_tasks"] ?? 0,
            done: stats["done"] ?? 0,
            in_progress: stats["in_progress"] ?? 0,
            pending: stats["pending"] ?? 0,
            escalated: stats["escalated"] ?? 0,
            projects: projectCount,
        };
    },
    // ── Workspace tokens (for agentinbox-mcp socket auth) ─────────────────────
    issueWorkspaceToken(workspaceId) {
        const token = `wt_${(0, nanoid_1.nanoid)(32)}`;
        db_1.db.prepare("UPDATE workspaces SET workspace_token = ? WHERE id = ?").run(token, workspaceId);
        return token;
    },
    getWorkspaceByToken(token) {
        return db_1.db
            .prepare("SELECT id, name, plan FROM workspaces WHERE workspace_token = ?")
            .get(token);
    },
    rotateWorkspaceToken(workspaceId) {
        const token = `wt_${(0, nanoid_1.nanoid)(32)}`;
        db_1.db.prepare("UPDATE workspaces SET workspace_token = ? WHERE id = ?").run(token, workspaceId);
        return token;
    },
    getWorkspaceToken(workspaceId) {
        const row = db_1.db
            .prepare("SELECT workspace_token FROM workspaces WHERE id = ?")
            .get(workspaceId);
        return row?.workspace_token ?? null;
    },
    // ── Telegram per-workspace config ─────────────────────────────────────────
    getTelegramConfig(workspaceId) {
        const row = db_1.db
            .prepare("SELECT telegram_bot_token, telegram_chat_id, telegram_project_id FROM workspaces WHERE id = ?")
            .get(workspaceId);
        return {
            bot_token: row?.telegram_bot_token ?? null,
            chat_id: row?.telegram_chat_id ?? null,
            project_id: row?.telegram_project_id ?? null,
        };
    },
    setTelegramConfig(workspaceId, botToken, chatId, projectId) {
        db_1.db.prepare("UPDATE workspaces SET telegram_bot_token = ?, telegram_chat_id = ?, telegram_project_id = ? WHERE id = ?")
            .run(botToken, chatId, projectId, workspaceId);
    },
    getAllWorkspacesWithTelegram() {
        return db_1.db
            .prepare("SELECT id, telegram_bot_token, telegram_chat_id, telegram_project_id FROM workspaces WHERE telegram_bot_token IS NOT NULL AND telegram_chat_id IS NOT NULL")
            .all();
    },
};
//# sourceMappingURL=tasks.js.map