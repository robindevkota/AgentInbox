import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

export const db: DatabaseType = new Database(path.join(DATA_DIR, "agentinbox.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    token TEXT NOT NULL UNIQUE,
    -- Phase 3: approval gate
    require_approval INTEGER NOT NULL DEFAULT 0,
    -- Phase 3: Tier 2 email OTP — comma-separated allowed email patterns
    allowed_emails TEXT,
    -- Phase 4: white label branding
    brand_name TEXT,
    brand_color TEXT,
    brand_logo_url TEXT,
    -- Phase 4: notification email for PM on task events
    notify_email TEXT,
    -- Phase 4: Slack channel to post completion summaries
    slack_channel TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','awaiting_approval','in_progress','done','failed','blocked','escalated')),
    submitter_name TEXT,
    submitter_email TEXT,
    file_path TEXT,
    file_name TEXT,
    file_content TEXT,
    summary_technical TEXT,
    summary_plain TEXT,
    -- Phase 3: approval gate
    proposed_plan TEXT,
    approved_at INTEGER,
    approved_by TEXT,
    rejected_at INTEGER,
    rejected_reason TEXT,
    escalation_reason TEXT,
    -- Phase 4: Slack message ts for updating in-place
    slack_ts TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Phase 3: email OTP tokens for Tier 2 auth
  CREATE TABLE IF NOT EXISTS otp_tokens (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Phase 4: audit log
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    project_id TEXT,
    task_id TEXT,
    action TEXT NOT NULL,
    actor TEXT,
    detail TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
  CREATE INDEX IF NOT EXISTS idx_projects_token ON projects(token);
  CREATE INDEX IF NOT EXISTS idx_otp_project_email ON otp_tokens(project_id, email);
  CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_log(task_id);
`);

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}
