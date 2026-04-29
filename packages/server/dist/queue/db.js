"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.nowUnix = nowUnix;
exports.seedFromEnv = seedFromEnv;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const DATA_DIR = process.env.DATA_DIR || path_1.default.join(process.cwd(), "data");
fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
fs_1.default.mkdirSync(path_1.default.join(DATA_DIR, "uploads"), { recursive: true });
exports.db = new better_sqlite3_1.default(path_1.default.join(DATA_DIR, "agentinbox.db"));
exports.db.pragma("journal_mode = WAL");
exports.db.pragma("foreign_keys = ON");
exports.db.exec(`
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
`);
// Run migrations for columns added after initial schema
const migrations = {
    "projects.custom_fields": "ALTER TABLE projects ADD COLUMN custom_fields TEXT",
    "tasks.custom_field_values": "ALTER TABLE tasks ADD COLUMN custom_field_values TEXT",
};
for (const [key, sql] of Object.entries(migrations)) {
    const already = exports.db.prepare("SELECT key FROM _migrations WHERE key = ?").get(key);
    if (!already) {
        try {
            exports.db.exec(sql);
        }
        catch { }
        exports.db.prepare("INSERT OR IGNORE INTO _migrations (key) VALUES (?)").run(key);
    }
}
exports.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
  CREATE INDEX IF NOT EXISTS idx_projects_token ON projects(token);
  CREATE INDEX IF NOT EXISTS idx_otp_project_email ON otp_tokens(project_id, email);
  CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_log(task_id);
`);
function nowUnix() {
    return Math.floor(Date.now() / 1000);
}
// Auto-seed from env vars so data survives redeploys via fixed token
function seedFromEnv() {
    const wsName = process.env.SEED_WORKSPACE_NAME;
    const wsId = process.env.SEED_WORKSPACE_ID;
    const projName = process.env.SEED_PROJECT_NAME;
    const projToken = process.env.SEED_PROJECT_TOKEN;
    const projDesc = process.env.SEED_PROJECT_DESC || "";
    const notifyEmail = process.env.SEED_NOTIFY_EMAIL || "";
    const customFields = process.env.SEED_CUSTOM_FIELDS || "";
    if (!wsName || !wsId || !projName || !projToken)
        return;
    const existingWs = exports.db.prepare("SELECT id FROM workspaces WHERE id = ?").get(wsId);
    if (!existingWs) {
        exports.db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run(wsId, wsName);
    }
    const existingProj = exports.db.prepare("SELECT id FROM projects WHERE token = ?").get(projToken);
    if (!existingProj) {
        const { nanoid } = require("nanoid");
        const projId = nanoid();
        exports.db.prepare(`INSERT INTO projects (id, workspace_id, name, description, token, notify_email, brand_color, custom_fields)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(projId, wsId, projName, projDesc, projToken, notifyEmail, "#6366f1", customFields || null);
        console.log(`  ✓ Seeded project "${projName}" with token ${projToken}`);
    }
}
//# sourceMappingURL=db.js.map