import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

// Use libsql (Turso) when TURSO_URL is set, otherwise fall back to local SQLite via better-sqlite3
let db: any;
if (process.env.TURSO_URL) {
  const libsql = require("libsql");
  const Database = libsql.default || libsql;
  db = new Database(process.env.TURSO_URL, {
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
} else {
  const bs3 = require("better-sqlite3");
  const Database = bs3.default || bs3;
  db = new Database(path.join(DATA_DIR, "agentinbox.db"));
}

export { db };

if (!process.env.TURSO_URL) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
}

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
    -- Custom fields config: JSON array of {name, type, options?, required?}
    -- e.g. [{"name":"Module","type":"dropdown","options":["personal-info","account-info"],"required":true}]
    custom_fields TEXT,
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

  -- custom_fields column on tasks to store submitted values as JSON
  CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY);

  CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Run migrations for columns added after initial schema
const migrations: Record<string, string> = {
  "projects.custom_fields": "ALTER TABLE projects ADD COLUMN custom_fields TEXT",
  "tasks.custom_field_values": "ALTER TABLE tasks ADD COLUMN custom_field_values TEXT",
  "tasks.priority": "ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'",
  "tasks.pr_link": "ALTER TABLE tasks ADD COLUMN pr_link TEXT",
  "tasks.screenshot_path": "ALTER TABLE tasks ADD COLUMN screenshot_path TEXT",
  "tasks.screenshot_base64": "ALTER TABLE tasks ADD COLUMN screenshot_base64 TEXT",
  "tasks.submitter_notified_at": "ALTER TABLE tasks ADD COLUMN submitter_notified_at INTEGER",
};
for (const [key, sql] of Object.entries(migrations)) {
  const already = db.prepare("SELECT key FROM _migrations WHERE key = ?").get(key);
  if (!already) {
    try { db.exec(sql); } catch {}
    db.prepare("INSERT OR IGNORE INTO _migrations (key) VALUES (?)").run(key);
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
  CREATE INDEX IF NOT EXISTS idx_projects_token ON projects(token);
  CREATE INDEX IF NOT EXISTS idx_otp_project_email ON otp_tokens(project_id, email);
  CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_log(task_id);
`);

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

// Auto-seed from env vars so data survives redeploys via fixed token
export function seedFromEnv() {
  const wsName = process.env.SEED_WORKSPACE_NAME;
  const wsId   = process.env.SEED_WORKSPACE_ID;
  const projName  = process.env.SEED_PROJECT_NAME;
  const projToken = process.env.SEED_PROJECT_TOKEN;
  const projDesc  = process.env.SEED_PROJECT_DESC || "";
  const notifyEmail = process.env.SEED_NOTIFY_EMAIL || "";
  const customFields = process.env.SEED_CUSTOM_FIELDS || "";

  if (!wsName || !wsId || !projName || !projToken) return;

  const existingWs = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(wsId);
  if (!existingWs) {
    db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run(wsId, wsName);
  }

  const existingProj = db.prepare("SELECT id FROM projects WHERE token = ?").get(projToken);
  if (!existingProj) {
    const { nanoid } = require("nanoid");
    const projId = nanoid();
    db.prepare(`INSERT INTO projects (id, workspace_id, name, description, token, notify_email, brand_color, custom_fields)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(projId, wsId, projName, projDesc, projToken, notifyEmail, "#6366f1", customFields || null);
    console.log(`  ✓ Seeded project "${projName}" with token ${projToken}`);
  }
}
