import { db, nowUnix } from "./db";
import { nanoid } from "nanoid";

export type TaskStatus =
  | "pending"
  | "awaiting_approval"
  | "in_progress"
  | "done"
  | "failed"
  | "blocked"
  | "escalated";

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  submitter_name: string | null;
  submitter_email: string | null;
  file_path: string | null;
  file_name: string | null;
  file_content: string | null;
  file_data: string | null;
  summary_technical: string | null;
  summary_plain: string | null;
  pr_link: string | null;
  screenshot_path: string | null;
  screenshot_base64: string | null;
  proposed_plan: string | null;
  approved_at: number | null;
  approved_by: string | null;
  rejected_at: number | null;
  rejected_reason: string | null;
  escalation_reason: string | null;
  slack_ts: string | null;
  custom_field_values: string | null;
  submitter_notified_at: number | null;
  developer_reply: string | null;
  telegram_message_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: number;
}

export interface CustomField {
  name: string;
  type: "dropdown" | "text";
  options?: string[];
  required?: boolean;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  token: string;
  require_approval: number;
  allowed_emails: string | null;
  brand_name: string | null;
  brand_color: string | null;
  brand_logo_url: string | null;
  notify_email: string | null;
  slack_channel: string | null;
  custom_fields: string | null; // JSON: CustomField[]
  created_at: number;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: number;
}

export const taskQueries = {
  // ── Workspaces ────────────────────────────────────────────────────────────

  createWorkspace(name: string): Workspace {
    const id = nanoid();
    db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run(id, name);
    return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Workspace;
  },

  getWorkspace(id: string): Workspace | undefined {
    return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Workspace | undefined;
  },

  // ── Projects ──────────────────────────────────────────────────────────────

  createProject(
    workspaceId: string,
    name: string,
    description?: string,
    options?: {
      require_approval?: boolean;
      allowed_emails?: string;
      notify_email?: string;
      brand_name?: string;
      brand_color?: string;
      slack_channel?: string;
      custom_fields?: string;
    }
  ): Project {
    const id = nanoid();
    const token = nanoid(32);
    db.prepare(`
      INSERT INTO projects (id, workspace_id, name, description, token, require_approval, allowed_emails, notify_email, brand_name, brand_color, slack_channel, custom_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      name,
      description ?? null,
      token,
      options?.require_approval ? 1 : 0,
      options?.allowed_emails ?? null,
      options?.notify_email ?? null,
      options?.brand_name ?? null,
      options?.brand_color ?? null,
      options?.slack_channel ?? null,
      options?.custom_fields ?? null,
    );
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
  },

  updateProject(
    id: string,
    updates: Partial<{
      name: string;
      description: string;
      require_approval: boolean;
      allowed_emails: string;
      notify_email: string;
      brand_name: string;
      brand_color: string;
      brand_logo_url: string;
      slack_channel: string;
      custom_fields: string;
    }>
  ): Project | undefined {
    const fields = Object.entries(updates)
      .map(([k]) => `${k} = ?`)
      .join(", ");
    const values = Object.values(updates).map((v) =>
      typeof v === "boolean" ? (v ? 1 : 0) : v
    );
    db.prepare(`UPDATE projects SET ${fields} WHERE id = ?`).run(...values, id);
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
  },

  deleteProject(id: string): boolean {
    const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  },

  deleteTask(id: string): boolean {
    db.prepare("DELETE FROM audit_log WHERE task_id = ?").run(id);
    const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return result.changes > 0;
  },

  getProjectByToken(token: string): Project | undefined {
    return db.prepare("SELECT * FROM projects WHERE token = ?").get(token) as Project | undefined;
  },

  getProjectById(id: string): Project | undefined {
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
  },

  listProjects(workspaceId: string): Project[] {
    return db
      .prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId) as Project[];
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────

  createTask(data: {
    project_id: string;
    title: string;
    description: string;
    priority?: "low" | "medium" | "high";
    submitter_name?: string;
    submitter_email?: string;
    file_path?: string;
    file_name?: string;
    file_content?: string;
    file_data?: string;
    custom_field_values?: string;
  }): Task {
    const id = nanoid();
    db.prepare(`
      INSERT INTO tasks (id, project_id, title, description, priority, submitter_name, submitter_email, file_path, file_name, file_content, file_data, custom_field_values)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.project_id,
      data.title,
      data.description,
      data.priority ?? "medium",
      data.submitter_name ?? null,
      data.submitter_email ?? null,
      data.file_path ?? null,
      data.file_name ?? null,
      data.file_content ?? null,
      data.file_data ?? null,
      data.custom_field_values ?? null,
    );
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task;
  },

  getTask(id: string): Task | undefined {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
  },

  getPendingTasks(projectId?: string): Task[] {
    const order = "ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at ASC";
    if (projectId) {
      return db
        .prepare(`SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ${order}`)
        .all(projectId) as Task[];
    }
    return db
      .prepare(`SELECT * FROM tasks WHERE status = 'pending' ${order}`)
      .all() as Task[];
  },

  getApprovedTasks(projectId?: string): Task[] {
    if (projectId) {
      return db
        .prepare(
          "SELECT * FROM tasks WHERE project_id = ? AND status IN ('pending','in_progress') AND (approved_at IS NOT NULL OR project_id NOT IN (SELECT id FROM projects WHERE require_approval = 1)) ORDER BY created_at ASC"
        )
        .all(projectId) as Task[];
    }
    return db
      .prepare(
        "SELECT * FROM tasks WHERE status IN ('pending','in_progress') ORDER BY created_at ASC"
      )
      .all() as Task[];
  },

  updateStatus(id: string, status: TaskStatus): Task | undefined {
    db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      nowUnix(),
      id
    );
    return taskQueries.getTask(id);
  },

  proposePlan(id: string, plan: string): Task | undefined {
    db.prepare(
      "UPDATE tasks SET status = 'awaiting_approval', proposed_plan = ?, updated_at = ? WHERE id = ?"
    ).run(plan, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  approveTask(id: string, approvedBy: string): Task | undefined {
    db.prepare(
      "UPDATE tasks SET status = 'in_progress', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?"
    ).run(nowUnix(), approvedBy, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  rejectTask(id: string, reason: string): Task | undefined {
    db.prepare(
      "UPDATE tasks SET status = 'pending', rejected_at = ?, rejected_reason = ?, updated_at = ? WHERE id = ?"
    ).run(nowUnix(), reason, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  completeTask(
    id: string,
    summaryTechnical: string,
    summaryPlain: string,
    prLink?: string,
    screenshotBase64?: string,
  ): Task | undefined {
    db.prepare(`
      UPDATE tasks SET status = 'done', summary_technical = ?, summary_plain = ?, pr_link = ?, screenshot_base64 = ?, updated_at = ?
      WHERE id = ?
    `).run(summaryTechnical, summaryPlain, prLink ?? null, screenshotBase64 ?? null, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  reopenTask(id: string): Task | undefined {
    db.prepare(
      "UPDATE tasks SET status = 'pending', updated_at = ? WHERE id = ?"
    ).run(nowUnix(), id);
    return taskQueries.getTask(id);
  },

  markSubmitterNotified(id: string): void {
    db.prepare("UPDATE tasks SET submitter_notified_at = ? WHERE id = ?").run(nowUnix(), id);
  },

  // ── Comments ──────────────────────────────────────────────────────────────

  addComment(taskId: string, author: string, body: string): TaskComment {
    const id = nanoid();
    db.prepare(
      "INSERT INTO task_comments (id, task_id, author, body) VALUES (?, ?, ?, ?)"
    ).run(id, taskId, author, body);
    return db.prepare("SELECT * FROM task_comments WHERE id = ?").get(id) as TaskComment;
  },

  getComments(taskId: string): TaskComment[] {
    return db
      .prepare("SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId) as TaskComment[];
  },

  escalateTask(id: string, reason: string): Task | undefined {
    db.prepare(
      "UPDATE tasks SET status = 'escalated', escalation_reason = ?, updated_at = ? WHERE id = ?"
    ).run(reason, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  setSlackTs(id: string, slackTs: string): void {
    db.prepare("UPDATE tasks SET slack_ts = ? WHERE id = ?").run(slackTs, id);
  },

  listTasks(projectId: string, status?: TaskStatus): Task[] {
    if (status) {
      return db
        .prepare(
          "SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY created_at DESC"
        )
        .all(projectId, status) as Task[];
    }
    return db
      .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as Task[];
  },

  // ── OTP ───────────────────────────────────────────────────────────────────

  createOtp(projectId: string, email: string): string {
    const id = nanoid();
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = nowUnix() + 10 * 60; // 10 minutes
    db.prepare(
      "INSERT INTO otp_tokens (id, project_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, projectId, email, token, expiresAt);
    return token;
  },

  verifyOtp(projectId: string, email: string, token: string): boolean {
    const row = db
      .prepare(
        "SELECT * FROM otp_tokens WHERE project_id = ? AND email = ? AND token = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(projectId, email, token, nowUnix()) as { id: string } | undefined;
    if (!row) return false;
    db.prepare("UPDATE otp_tokens SET used_at = ? WHERE id = ?").run(nowUnix(), row.id);
    return true;
  },

  // ── Audit log ─────────────────────────────────────────────────────────────

  audit(entry: {
    workspace_id?: string;
    project_id?: string;
    task_id?: string;
    action: string;
    actor?: string;
    detail?: string;
  }): void {
    db.prepare(`
      INSERT INTO audit_log (id, workspace_id, project_id, task_id, action, actor, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(),
      entry.workspace_id ?? null,
      entry.project_id ?? null,
      entry.task_id ?? null,
      entry.action,
      entry.actor ?? null,
      entry.detail ?? null,
    );
  },

  getAuditLog(taskId: string): unknown[] {
    return db
      .prepare("SELECT * FROM audit_log WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId);
  },

  // ── Usage stats ───────────────────────────────────────────────────────────

  getWorkspaceStats(workspaceId: string): {
    total_tasks: number;
    done: number;
    in_progress: number;
    pending: number;
    escalated: number;
    projects: number;
  } {
    const stats = db
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
      .get(workspaceId) as Record<string, number>;

    const projectCount = (
      db
        .prepare("SELECT COUNT(*) as n FROM projects WHERE workspace_id = ?")
        .get(workspaceId) as { n: number }
    ).n;

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

  issueWorkspaceToken(workspaceId: string): string {
    const token = `wt_${nanoid(32)}`;
    db.prepare("UPDATE workspaces SET workspace_token = ? WHERE id = ?").run(token, workspaceId);
    return token;
  },

  getWorkspaceByToken(token: string): { id: string; name: string; plan: string } | null {
    return db
      .prepare("SELECT id, name, plan FROM workspaces WHERE workspace_token = ?")
      .get(token) as { id: string; name: string; plan: string } | null;
  },

  rotateWorkspaceToken(workspaceId: string): string {
    const token = `wt_${nanoid(32)}`;
    db.prepare("UPDATE workspaces SET workspace_token = ? WHERE id = ?").run(token, workspaceId);
    return token;
  },

  getWorkspaceToken(workspaceId: string): string | null {
    const row = db
      .prepare("SELECT workspace_token FROM workspaces WHERE id = ?")
      .get(workspaceId) as { workspace_token: string | null } | null;
    return row?.workspace_token ?? null;
  },
};
