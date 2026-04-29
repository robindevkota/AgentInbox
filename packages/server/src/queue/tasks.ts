import { db, nowUnix } from "./db";
import { nanoid } from "nanoid";

export type TaskStatus =
  | "pending"
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
  submitter_name: string | null;
  submitter_email: string | null;
  file_path: string | null;
  file_name: string | null;
  file_content: string | null;
  summary_technical: string | null;
  summary_plain: string | null;
  escalation_reason: string | null;
  created_at: number;
  updated_at: number;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  token: string;
  created_at: number;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: number;
}

export const taskQueries = {
  createWorkspace(name: string): Workspace {
    const id = nanoid();
    db.prepare(
      "INSERT INTO workspaces (id, name) VALUES (?, ?)"
    ).run(id, name);
    return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Workspace;
  },

  createProject(workspaceId: string, name: string, description?: string): Project {
    const id = nanoid();
    const token = nanoid(32);
    db.prepare(
      "INSERT INTO projects (id, workspace_id, name, description, token) VALUES (?, ?, ?, ?, ?)"
    ).run(id, workspaceId, name, description ?? null, token);
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
  },

  getProjectByToken(token: string): Project | undefined {
    return db.prepare("SELECT * FROM projects WHERE token = ?").get(token) as Project | undefined;
  },

  getProjectById(id: string): Project | undefined {
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
  },

  listProjects(workspaceId: string): Project[] {
    return db.prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC").all(workspaceId) as Project[];
  },

  createTask(data: {
    project_id: string;
    title: string;
    description: string;
    submitter_name?: string;
    submitter_email?: string;
    file_path?: string;
    file_name?: string;
    file_content?: string;
  }): Task {
    const id = nanoid();
    db.prepare(`
      INSERT INTO tasks (id, project_id, title, description, submitter_name, submitter_email, file_path, file_name, file_content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.project_id,
      data.title,
      data.description,
      data.submitter_name ?? null,
      data.submitter_email ?? null,
      data.file_path ?? null,
      data.file_name ?? null,
      data.file_content ?? null,
    );
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task;
  },

  getTask(id: string): Task | undefined {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
  },

  getPendingTasks(projectId?: string): Task[] {
    if (projectId) {
      return db.prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC"
      ).all(projectId) as Task[];
    }
    return db.prepare(
      "SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC"
    ).all() as Task[];
  },

  updateStatus(id: string, status: TaskStatus): Task | undefined {
    db.prepare(
      "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?"
    ).run(status, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  completeTask(id: string, summaryTechnical: string, summaryPlain: string): Task | undefined {
    db.prepare(`
      UPDATE tasks SET status = 'done', summary_technical = ?, summary_plain = ?, updated_at = ?
      WHERE id = ?
    `).run(summaryTechnical, summaryPlain, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  escalateTask(id: string, reason: string): Task | undefined {
    db.prepare(`
      UPDATE tasks SET status = 'escalated', escalation_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reason, nowUnix(), id);
    return taskQueries.getTask(id);
  },

  listTasks(projectId: string, status?: TaskStatus): Task[] {
    if (status) {
      return db.prepare(
        "SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY created_at DESC"
      ).all(projectId, status) as Task[];
    }
    return db.prepare(
      "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC"
    ).all(projectId) as Task[];
  },
};
