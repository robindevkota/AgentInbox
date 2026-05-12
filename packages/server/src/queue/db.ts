import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

// Use libsql (Turso) when TURSO_URL is set, otherwise fall back to local SQLite via better-sqlite3
let db: any;
if (process.env.TURSO_URL) {
  // Use sync API so prepare().run()/.get()/.all() work synchronously — same as better-sqlite3
  const Database = require("libsql");
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
  "tasks.file_data": "ALTER TABLE tasks ADD COLUMN file_data TEXT",
  // Monetization: user accounts + per-workspace billing
  "users.table": `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  "workspaces.owner_id": "ALTER TABLE workspaces ADD COLUMN owner_id TEXT REFERENCES users(id)",
  "workspaces.plan": "ALTER TABLE workspaces ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'",
  "workspaces.task_count_this_month": "ALTER TABLE workspaces ADD COLUMN task_count_this_month INTEGER NOT NULL DEFAULT 0",
  "workspaces.plan_expires_at": "ALTER TABLE workspaces ADD COLUMN plan_expires_at INTEGER",
  "workspaces.billing_month": "ALTER TABLE workspaces ADD COLUMN billing_month TEXT",
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

// Auto-seed default account so the hosted instance survives restarts (SQLite wiped on Render free tier)
export function seedFromEnv() {
  if (!process.env.TURSO_URL) db.pragma("foreign_keys = OFF");
  const wsId      = process.env.SEED_WORKSPACE_ID   || "robin-workspace-001";
  const wsName    = process.env.SEED_WORKSPACE_NAME  || "Robin Workspace";
  const projToken = process.env.SEED_PROJECT_TOKEN   || "898NSXnUt9stlGsOCtJM0jPaNSVGb7Mz";
  const projName  = process.env.SEED_PROJECT_NAME    || "AgentInbox";
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    || "robin@agentinbox.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
  const adminUserId   = "seed-admin-user-001";

  // Seed admin user
  const existingUser = db.prepare("SELECT id FROM users WHERE id = ? OR email = ?").get(adminUserId, adminEmail);
  if (!existingUser) {
    const bcrypt = require("bcryptjs");
    const hash = bcrypt.hashSync(adminPassword, 10);
    if (!process.env.TURSO_URL) db.pragma("foreign_keys = OFF");
    db.prepare("INSERT OR REPLACE INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(adminUserId, adminEmail, hash);
    if (!process.env.TURSO_URL) db.pragma("foreign_keys = ON");
    console.log(`  ✓ Seeded admin user: ${adminEmail}`);
  }

  // Seed workspace
  const existingWs = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(wsId);
  if (!existingWs) {
    db.prepare("INSERT INTO workspaces (id, name, owner_id, plan) VALUES (?, ?, ?, 'pro')").run(wsId, wsName, adminUserId);
    console.log(`  ✓ Seeded workspace: ${wsName}`);
  }

  // Seed project
  const mblCustomFields = JSON.stringify([
    { name: "Environment", type: "dropdown", options: ["UAT", "Live"], required: true },
    { name: "Module", type: "dropdown", options: ["ncna", "newcifindiv", "newcifcorporate", "online account opening"], required: true },
    { name: "Steps", type: "dropdown", options: ["screening", "personal address", "review"], required: true },
    { name: "Case ID", type: "text", required: false },
  ]);
  const existingProj = db.prepare("SELECT id FROM projects WHERE token = ?").get(projToken);
  if (!existingProj) {
    const { nanoid } = require("nanoid");
    db.prepare(`INSERT INTO projects (id, workspace_id, name, token, brand_color, custom_fields) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(nanoid(), wsId, projName, projToken, "#6366f1", mblCustomFields);
    console.log(`  ✓ Seeded project "${projName}" with token ${projToken}`);
  } else {
    db.prepare("UPDATE projects SET custom_fields = ? WHERE token = ?").run(mblCustomFields, projToken);
  }

  if (!process.env.TURSO_URL) db.pragma("foreign_keys = ON");
}
