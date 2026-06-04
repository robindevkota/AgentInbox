"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRouter = createRouter;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const tasks_1 = require("../queue/tasks");
const db_1 = require("../queue/db");
const tokens_1 = require("../auth/tokens");
const users_1 = require("../auth/users");
const parser_1 = require("../files/parser");
const mailer_1 = require("../email/mailer");
const notify_1 = require("../webhook/notify");
const manager_1 = require("../socket/manager");
const bot_1 = require("../telegram/bot");
const claude_1 = require("../trigger/claude");
const FREE_TASK_LIMIT = 50;
const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/markdown",
            "text/csv",
            "application/json",
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
        ];
        cb(null, allowed.includes(file.mimetype));
    },
});
function buildMcpConfig(token) {
    return {
        mcpServers: {
            agentinbox: {
                command: "npx",
                args: ["-y", "agentinbox-mcp"],
                env: { AGENTINBOX_TOKEN: token },
            },
        },
    };
}
function createRouter() {
    const router = (0, express_1.Router)();
    // ── Public: project info + Tier 2 OTP ───────────────────────────────────
    // GET project info by token (for submission form header)
    router.get("/submit/:token", tokens_1.requireProjectToken, (req, res) => {
        const project = req.project;
        res.json({
            id: project.id,
            name: project.brand_name || project.name,
            description: project.description,
            requires_otp: !!(project.allowed_emails),
            brand_color: project.brand_color,
            brand_logo_url: project.brand_logo_url,
            brand_name: project.brand_name,
            custom_fields: project.custom_fields ? JSON.parse(project.custom_fields) : [],
        });
    });
    // POST request OTP for Tier 2 email auth
    router.post("/submit/:token/request-otp", tokens_1.requireProjectToken, async (req, res) => {
        const project = req.project;
        if (!project.allowed_emails) {
            res.status(400).json({ error: "This project does not require email verification" });
            return;
        }
        try {
            const { email } = zod_1.z.object({ email: zod_1.z.string().email() }).parse(req.body);
            // Check if email matches any allowed pattern (exact or wildcard domain)
            const patterns = project.allowed_emails.split(",").map((e) => e.trim());
            const allowed = patterns.some((pat) => {
                if (pat.startsWith("*@")) {
                    return email.endsWith(pat.slice(1));
                }
                return email.toLowerCase() === pat.toLowerCase();
            });
            if (!allowed) {
                res.status(403).json({ error: "Your email is not on the allowed list for this project" });
                return;
            }
            const otp = tasks_1.taskQueries.createOtp(project.id, email);
            await (0, mailer_1.sendOtp)(email, otp, project.name);
            res.json({ message: "Check your email for a 6-digit code" });
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // POST verify OTP and get a session token
    router.post("/submit/:token/verify-otp", tokens_1.requireProjectToken, (req, res) => {
        const project = req.project;
        try {
            const { email, otp } = zod_1.z
                .object({ email: zod_1.z.string().email(), otp: zod_1.z.string().length(6) })
                .parse(req.body);
            const valid = tasks_1.taskQueries.verifyOtp(project.id, email, otp);
            if (!valid) {
                res.status(401).json({ error: "Invalid or expired code" });
                return;
            }
            // Return a simple session token: base64(projectId:email:timestamp)
            // — not a security guarantee, just enough to gate the submit form
            const session = Buffer.from(`${project.id}:${email}:${Date.now()}`).toString("base64");
            res.json({ session, email });
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // POST submit a task (with optional file)
    router.post("/submit/:token", tokens_1.requireProjectToken, upload.single("file"), async (req, res) => {
        try {
            const project = req.project;
            // Tier 2: verify session header if project requires OTP
            if (project.allowed_emails) {
                const session = req.headers["x-otp-session"];
                if (!session) {
                    res.status(401).json({ error: "Email verification required" });
                    return;
                }
                try {
                    const decoded = Buffer.from(session, "base64").toString("utf-8");
                    const [pid] = decoded.split(":");
                    if (pid !== project.id)
                        throw new Error("invalid session");
                }
                catch {
                    res.status(401).json({ error: "Invalid session" });
                    return;
                }
            }
            // custom_field_values arrives as a JSON string when sent via FormData
            if (req.body.custom_field_values && typeof req.body.custom_field_values === "string") {
                try {
                    req.body.custom_field_values = JSON.parse(req.body.custom_field_values);
                }
                catch { }
            }
            const body = zod_1.z
                .object({
                title: zod_1.z.string().min(1).max(200),
                description: zod_1.z.string().min(1).max(50000),
                priority: zod_1.z.enum(["low", "medium", "high"]).optional(),
                submitter_name: zod_1.z.string().max(100).optional(),
                submitter_email: zod_1.z.string().email().optional(),
                custom_field_values: zod_1.z.record(zod_1.z.string()).optional(),
            })
                .parse(req.body);
            let fileName;
            let fileContent;
            let fileData;
            if (req.file) {
                fileName = req.file.originalname;
                fileData = req.file.buffer.toString("base64");
                try {
                    // Write to a temp file for parsing, then clean up
                    const os = await Promise.resolve().then(() => __importStar(require("os")));
                    const fs = await Promise.resolve().then(() => __importStar(require("fs")));
                    const tmpPath = path_1.default.join(os.tmpdir(), `upload-${Date.now()}${path_1.default.extname(fileName)}`);
                    fs.writeFileSync(tmpPath, req.file.buffer);
                    fileContent = await (0, parser_1.parseFile)(tmpPath, req.file.mimetype);
                    fs.unlinkSync(tmpPath);
                }
                catch {
                    fileContent = `[Could not parse file: ${fileName}]`;
                }
            }
            // Enforce free-tier task limit (only when billing is enabled)
            if (BILLING_ENABLED) {
                const ws = db_1.db
                    .prepare("SELECT plan, task_count_this_month, billing_month FROM workspaces WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)")
                    .get(project.id);
                if (ws && ws.plan === "free") {
                    const currentMonth = new Date().toISOString().slice(0, 7);
                    if (ws.billing_month !== currentMonth) {
                        db_1.db.prepare("UPDATE workspaces SET task_count_this_month = 0, billing_month = ? WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)").run(currentMonth, project.id);
                        ws.task_count_this_month = 0;
                    }
                    if (ws.task_count_this_month >= FREE_TASK_LIMIT) {
                        res.status(403).json({ error: "Free plan limit reached (50 tasks/month). Upgrade to Pro to continue.", upgrade_required: true });
                        return;
                    }
                    db_1.db.prepare("UPDATE workspaces SET task_count_this_month = task_count_this_month + 1 WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)").run(project.id);
                }
            }
            const task = tasks_1.taskQueries.createTask({
                project_id: project.id,
                title: body.title,
                description: body.description,
                priority: body.priority,
                submitter_name: body.submitter_name,
                submitter_email: body.submitter_email,
                file_name: fileName,
                file_content: fileContent,
                file_data: fileData,
                custom_field_values: body.custom_field_values
                    ? JSON.stringify(body.custom_field_values)
                    : undefined,
            });
            tasks_1.taskQueries.audit({
                project_id: project.id,
                task_id: task.id,
                action: "task_submitted",
                actor: body.submitter_email || body.submitter_name || "anonymous",
            });
            const taskPayload = {
                event: "task.created",
                task_id: task.id,
                project_id: project.id,
                project_name: project.name,
                project_token: project.token,
                title: task.title,
                description: task.description,
                submitter_name: task.submitter_name,
                has_file: !!task.file_name,
            };
            // Emit to connected agentinbox-mcp socket for this workspace
            const workspace = db_1.db
                .prepare("SELECT id FROM workspaces WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)")
                .get(project.id);
            if (workspace) {
                (0, manager_1.emitTaskCreated)(workspace.id, taskPayload);
                (0, manager_1.emitToPm)(workspace.id, "task.submitted", {
                    task_id: task.id,
                    title: task.title,
                    project_name: project.name,
                    submitter_name: task.submitter_name,
                    priority: task.priority,
                });
            }
            // Also fire webhook as fallback (ngrok/router still supported)
            (0, notify_1.fireWebhook)(taskPayload).catch(() => { });
            // Telegram notification
            (0, bot_1.notifyTaskSubmitted)(task.id, task.title, project.name).catch(() => { });
            // Trigger Claude to wake up and process the task (event-driven, no idle polling)
            if (process.env.TRIGGER_CLAUDE === "true")
                (0, claude_1.triggerClaude)();
            res.status(201).json({
                id: task.id,
                status: task.status,
                created_at: task.created_at,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Invalid request";
            res.status(400).json({ error: message });
        }
    });
    // GET task status (public — anyone with task ID can poll)
    router.get("/tasks/:id/status", (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const project = tasks_1.taskQueries.getProjectById(task.project_id);
        res.json({
            id: task.id,
            status: task.status,
            title: task.title,
            summary_plain: task.summary_plain,
            escalation_reason: task.status === "escalated" ? "This task needs human review." : null,
            awaiting_approval: task.status === "awaiting_approval",
            proposed_plan: task.status === "awaiting_approval" ? task.proposed_plan : null,
            updated_at: task.updated_at,
            brand_name: project?.brand_name || null,
            brand_color: project?.brand_color || null,
        });
    });
    // SSE live stream
    router.get("/tasks/:id/stream", (req, res) => {
        const { id } = req.params;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();
        const send = () => {
            const task = tasks_1.taskQueries.getTask(id);
            if (!task) {
                res.write(`data: ${JSON.stringify({ error: "not_found" })}\n\n`);
                return;
            }
            res.write(`data: ${JSON.stringify({
                id: task.id,
                status: task.status,
                summary_plain: task.summary_plain,
                updated_at: task.updated_at,
            })}\n\n`);
            if (["done", "failed", "escalated"].includes(task.status)) {
                clearInterval(interval);
                res.end();
            }
        };
        send();
        const interval = setInterval(send, 2000);
        req.on("close", () => clearInterval(interval));
    });
    // ── Auth routes ──────────────────────────────────────────────────────────
    router.post("/auth/signup", async (req, res) => {
        try {
            const { email, password, workspace_name } = zod_1.z
                .object({
                email: zod_1.z.string().email(),
                password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
                workspace_name: zod_1.z.string().min(1),
            })
                .parse(req.body);
            const result = await (0, users_1.signupUser)(email, password, workspace_name);
            res.status(201).json(result);
        }
        catch (err) {
            res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        }
    });
    router.post("/auth/login", async (req, res) => {
        try {
            const { email, password } = zod_1.z
                .object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(1) })
                .parse(req.body);
            const result = await (0, users_1.loginUser)(email, password);
            res.json(result);
        }
        catch (err) {
            console.error("[login error]", err);
            res.status(401).json({ error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
        }
    });
    router.get("/auth/debug-users", (_req, res) => {
        const users = db_1.db.prepare("SELECT id, email FROM users").all();
        res.json(users);
    });
    router.get("/auth/debug-bcrypt", async (_req, res) => {
        try {
            const bcryptjs = require("bcryptjs");
            const hash = bcryptjs.hashSync("test", 10);
            const valid = bcryptjs.compareSync("test", hash);
            res.json({ ok: true, hash, valid });
        }
        catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });
    router.post("/auth/reset-password", async (req, res) => {
        try {
            const { email, new_password, reset_secret } = zod_1.z
                .object({ email: zod_1.z.string().email(), new_password: zod_1.z.string().min(6), reset_secret: zod_1.z.string() })
                .parse(req.body);
            if (reset_secret !== (process.env.RESET_SECRET || "reset-me-now")) {
                res.status(403).json({ error: "Invalid reset secret" });
                return;
            }
            const bcryptjs = await Promise.resolve().then(() => __importStar(require("bcryptjs")));
            const hash = await bcryptjs.hash(new_password, 10);
            db_1.db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(hash, email.toLowerCase());
            res.json({ ok: true, email });
        }
        catch (err) {
            res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        }
    });
    router.get("/auth/me", (req, res) => {
        const authHeader = req.headers["authorization"];
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) {
            res.status(401).json({ error: "Authentication required" });
            return;
        }
        const payload = (0, users_1.verifyToken)(token);
        if (!payload) {
            res.status(401).json({ error: "Invalid or expired token" });
            return;
        }
        const me = (0, users_1.getMe)(payload.userId);
        if (!me) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json(me);
    });
    // ── PM / Admin routes (JWT auth for hosted, API key fallback for self-hosted) ──
    // Workspace management
    router.post("/workspaces", tokens_1.requireAuth, (req, res) => {
        try {
            const { name } = zod_1.z.object({ name: zod_1.z.string().min(1) }).parse(req.body);
            const workspace = tasks_1.taskQueries.createWorkspace(name);
            res.status(201).json(workspace);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // Usage dashboard stats
    router.get("/workspaces/:workspaceId/stats", tokens_1.requireAuth, (req, res) => {
        const stats = tasks_1.taskQueries.getWorkspaceStats(req.params.workspaceId);
        const ws = db_1.db
            .prepare("SELECT plan, task_count_this_month FROM workspaces WHERE id = ?")
            .get(req.params.workspaceId);
        res.json({ ...stats, plan: ws?.plan ?? "free", task_count_this_month: ws?.task_count_this_month ?? 0, free_task_limit: FREE_TASK_LIMIT });
    });
    // Project management
    router.post("/workspaces/:workspaceId/projects", tokens_1.requireAuth, (req, res) => {
        try {
            const body = zod_1.z
                .object({
                name: zod_1.z.string().min(1),
                description: zod_1.z.string().optional(),
                require_approval: zod_1.z.boolean().optional(),
                allowed_emails: zod_1.z.string().optional(),
                notify_email: zod_1.z.string().email().optional(),
                brand_name: zod_1.z.string().optional(),
                brand_color: zod_1.z.string().optional(),
                slack_channel: zod_1.z.string().optional(),
            })
                .parse(req.body);
            const project = tasks_1.taskQueries.createProject(req.params.workspaceId, body.name, body.description, body);
            res.status(201).json(project);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    router.get("/workspaces/:workspaceId/projects", tokens_1.requireAuth, (req, res) => {
        const projects = tasks_1.taskQueries.listProjects(req.params.workspaceId);
        res.json(projects);
    });
    router.delete("/projects/:id", tokens_1.requireAuth, (req, res) => {
        const deleted = tasks_1.taskQueries.deleteProject(req.params.id);
        if (!deleted) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        res.json({ ok: true });
    });
    router.patch("/projects/:id", tokens_1.requireAuth, (req, res) => {
        try {
            const body = zod_1.z
                .object({
                name: zod_1.z.string().optional(),
                description: zod_1.z.string().optional(),
                require_approval: zod_1.z.boolean().optional(),
                allowed_emails: zod_1.z.string().optional(),
                notify_email: zod_1.z.string().email().optional(),
                brand_name: zod_1.z.string().optional(),
                brand_color: zod_1.z.string().optional(),
                brand_logo_url: zod_1.z.string().url().optional(),
                slack_channel: zod_1.z.string().optional(),
                custom_fields: zod_1.z.string().optional(), // JSON string of CustomField[]
            })
                .parse(req.body);
            const project = tasks_1.taskQueries.updateProject(req.params.id, body);
            if (!project) {
                res.status(404).json({ error: "Project not found" });
                return;
            }
            res.json(project);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // Task list for PM dashboard
    router.get("/projects/:projectId/tasks", tokens_1.requireAuth, (req, res) => {
        const status = req.query.status;
        const tasks = tasks_1.taskQueries.listTasks(req.params.projectId, status);
        res.json(tasks);
    });
    // Full task detail + audit log
    router.get("/tasks/:id", tokens_1.requireAuth, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const audit = tasks_1.taskQueries.getAuditLog(req.params.id);
        res.json({ ...task, audit });
    });
    router.delete("/tasks/:id", tokens_1.requireAuth, (req, res) => {
        const deleted = tasks_1.taskQueries.deleteTask(req.params.id);
        if (!deleted) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        res.json({ success: true });
    });
    // ── Approval gate ────────────────────────────────────────────────────────
    router.post("/tasks/:id/approve", tokens_1.requireAuth, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        if (task.status !== "awaiting_approval") {
            res.status(400).json({ error: "Task is not awaiting approval" });
            return;
        }
        const approvedBy = req.query.by || "PM";
        const updated = tasks_1.taskQueries.approveTask(req.params.id, approvedBy);
        tasks_1.taskQueries.audit({
            project_id: task.project_id,
            task_id: task.id,
            action: "task_approved",
            actor: approvedBy,
        });
        res.json(updated);
    });
    router.post("/tasks/:id/reject", tokens_1.requireAuth, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        try {
            const { reason } = zod_1.z.object({ reason: zod_1.z.string().min(1) }).parse(req.body);
            const updated = tasks_1.taskQueries.rejectTask(req.params.id, reason);
            tasks_1.taskQueries.audit({
                project_id: task.project_id,
                task_id: task.id,
                action: "task_rejected",
                detail: reason,
            });
            res.json(updated);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // Reopen a completed/failed/escalated task back to pending
    router.post("/tasks/:id/reopen", tokens_1.requireAuth, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const updated = tasks_1.taskQueries.reopenTask(req.params.id);
        tasks_1.taskQueries.audit({
            project_id: task.project_id,
            task_id: task.id,
            action: "task_reopened",
            actor: req.query.by || "PM",
        });
        res.json(updated);
    });
    // Comments
    router.get("/tasks/:id/comments", tokens_1.requireAuth, (req, res) => {
        const comments = tasks_1.taskQueries.getComments(req.params.id);
        res.json(comments);
    });
    router.post("/tasks/:id/comments", tokens_1.requireAuth, (req, res) => {
        try {
            const { author, body } = zod_1.z
                .object({ author: zod_1.z.string().min(1), body: zod_1.z.string().min(1) })
                .parse(req.body);
            const comment = tasks_1.taskQueries.addComment(req.params.id, author, body);
            tasks_1.taskQueries.audit({
                task_id: req.params.id,
                action: "comment_added",
                actor: author,
                detail: body,
            });
            res.status(201).json(comment);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // Serve uploaded file attachment from base64 stored in DB
    router.get("/tasks/:id/file", tokens_1.requireAuth, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task || !task.file_data) {
            res.status(404).json({ error: "No file for this task" });
            return;
        }
        const buf = Buffer.from(task.file_data, "base64");
        const ext = task.file_name ? path_1.default.extname(task.file_name).toLowerCase() : "";
        const mimeMap = {
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
        };
        res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
        res.setHeader("Content-Length", buf.length);
        res.send(buf);
    });
    // ── Workspace token (for agentinbox-mcp) ────────────────────────────────
    // GET current token (or issue one if not yet set)
    router.get("/workspaces/:workspaceId/token", tokens_1.requireAuth, (req, res) => {
        let token = tasks_1.taskQueries.getWorkspaceToken(req.params.workspaceId);
        if (!token)
            token = tasks_1.taskQueries.issueWorkspaceToken(req.params.workspaceId);
        res.json({ token, mcp_config: buildMcpConfig(token) });
    });
    // POST rotate token
    router.post("/workspaces/:workspaceId/token/rotate", tokens_1.requireAuth, (req, res) => {
        const token = tasks_1.taskQueries.rotateWorkspaceToken(req.params.workspaceId);
        res.json({ token, mcp_config: buildMcpConfig(token) });
    });
    // GET /setup/download — public endpoint, optional ?token=wt_... for pre-filled version
    router.get("/setup/download", (req, res) => {
        // Try to resolve workspace token — from query param or JWT header
        let wsToken = req.query.token || "wt_YOUR_TOKEN_HERE";
        // If JWT provided, use it to get the real token
        const authHeader = req.headers["authorization"];
        const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (jwt) {
            const payload = (0, users_1.verifyToken)(jwt);
            if (payload) {
                let t = tasks_1.taskQueries.getWorkspaceToken(payload.workspaceId);
                if (!t)
                    t = tasks_1.taskQueries.issueWorkspaceToken(payload.workspaceId);
                if (t)
                    wsToken = t;
            }
        }
        const setupMd = `Set up AgentInbox in this project. Token: ${wsToken}

Do not ask questions. Do the following:
1. Scan the codebase — understand the stack, key files, folder structure
2. Create .mcp.json:
   {
     "mcpServers": {
       "agentinbox": {
         "command": "npx",
         "args": ["-y", "agentinbox-mcp"],
         "env": { "AGENTINBOX_TOKEN": "${wsToken}" }
       }
     }
   }
3. Create .vscode/tasks.json (create .vscode/ if it doesn't exist):
   {
     "version": "2.0.0",
     "tasks": [{
       "label": "AgentInbox",
       "type": "shell",
       "command": "claude --dangerously-skip-permissions",
       "runOptions": { "runOn": "folderOpen" },
       "presentation": { "reveal": "always", "panel": "dedicated" },
       "problemMatcher": []
     }]
   }
4. Create CLAUDE.local.md — AgentInbox task processing rules tailored to this stack
5. Add CLAUDE.local.md and .mcp.json to .gitignore
6. Create .claude/rules/ — one file per domain area based on the codebase
7. Update CLAUDE.md — rule index pointing to those files
8. Tell me the submission link to share with my client/QA team

## What this sets up
- Tasks arrive via WebSocket — Claude wakes instantly, no polling, no idle tokens
- VS Code auto-starts Claude when the project opens (no terminal command needed)
- Claude processes all pending tasks then exits — wakes again on next task

## Troubleshooting
**MCP not connecting:** check AGENTINBOX_TOKEN in .mcp.json starts with wt_
**Claude not waking:** ensure VS Code is open — agentinbox-mcp must be running
**claude not in PATH:** add "CLAUDE_PATH": "/full/path/to/claude" to .mcp.json env`;
        res.setHeader("Content-Disposition", "attachment; filename=\"agentinbox-setup.txt\"");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(setupMd);
    });
    // ── Agent routes (workspace token auth, used by agentinbox-mcp) ────────────
    function requireWorkspaceToken(req, res, next) {
        const token = req.headers["x-workspace-token"];
        if (!token) {
            res.status(401).json({ error: "Missing x-workspace-token" });
            return;
        }
        const workspace = tasks_1.taskQueries.getWorkspaceByToken(token);
        if (!workspace) {
            res.status(401).json({ error: "Invalid workspace token" });
            return;
        }
        req.agentWorkspace = workspace;
        next();
    }
    router.get("/agent/workspace", requireWorkspaceToken, (req, res) => {
        const ws = req.agentWorkspace;
        res.json({ workspace_id: ws.id, workspace_name: ws.name, plan: ws.plan });
    });
    router.get("/agent/tasks/pending", requireWorkspaceToken, (req, res) => {
        const ws = req.agentWorkspace;
        const projects = db_1.db.prepare("SELECT id, require_approval FROM projects WHERE workspace_id = ?").all(ws.id);
        const tasks = projects.flatMap((p) => tasks_1.taskQueries.listTasks(p.id, "pending").map((t) => ({ ...t, require_approval: p.require_approval === 1 })));
        res.json(tasks);
    });
    router.get("/agent/tasks/:id", requireWorkspaceToken, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const project = tasks_1.taskQueries.getProjectById(task.project_id);
        res.json({ ...task, require_approval: project?.require_approval === 1 });
    });
    router.get("/agent/tasks/:id/file", requireWorkspaceToken, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task || !task.file_content) {
            res.status(404).json({ error: "No file for this task" });
            return;
        }
        res.json({ file_name: task.file_name, file_content: task.file_content });
    });
    router.post("/agent/tasks/:id/status", requireWorkspaceToken, (req, res) => {
        try {
            const { status } = zod_1.z.object({ status: zod_1.z.enum(["in_progress", "blocked", "failed"]) }).parse(req.body);
            const updated = tasks_1.taskQueries.updateStatus(req.params.id, status);
            res.json(updated);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    router.post("/agent/tasks/:id/complete", requireWorkspaceToken, (req, res) => {
        try {
            const { summary_technical, summary_plain, screenshot_base64 } = zod_1.z.object({
                summary_technical: zod_1.z.string().min(1),
                summary_plain: zod_1.z.string().min(1),
                screenshot_base64: zod_1.z.string().optional(),
            }).parse(req.body);
            const updated = tasks_1.taskQueries.completeTask(req.params.id, summary_technical, summary_plain, undefined, screenshot_base64);
            if (!updated) {
                res.status(404).json({ error: "Task not found" });
                return;
            }
            const ws = req.agentWorkspace;
            (0, manager_1.emitToPm)(ws.id, "task.done", {
                task_id: updated.id,
                title: updated.title,
                summary_plain,
                has_screenshot: !!screenshot_base64,
            });
            (0, bot_1.notifyTaskDone)(updated.id, updated.title).catch(() => { });
            res.json(updated);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    router.post("/agent/tasks/:id/escalate", requireWorkspaceToken, (req, res) => {
        try {
            const { reason } = zod_1.z.object({ reason: zod_1.z.string().min(1) }).parse(req.body);
            const updated = tasks_1.taskQueries.escalateTask(req.params.id, reason);
            if (!updated) {
                res.status(404).json({ error: "Task not found" });
                return;
            }
            const ws = req.agentWorkspace;
            (0, manager_1.emitToPm)(ws.id, "task.escalated", {
                task_id: updated.id,
                title: updated.title,
                reason,
            });
            (0, bot_1.notifyTaskEscalated)(updated.id, updated.title, reason).catch(() => { });
            res.json(updated);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    router.post("/agent/tasks/:id/propose", requireWorkspaceToken, (req, res) => {
        try {
            const { plan } = zod_1.z.object({ plan: zod_1.z.string().min(1) }).parse(req.body);
            const updated = tasks_1.taskQueries.proposePlan(req.params.id, plan);
            if (!updated) {
                res.status(404).json({ error: "Task not found" });
                return;
            }
            const ws = req.agentWorkspace;
            (0, manager_1.emitToPm)(ws.id, "task.approval_needed", {
                task_id: updated.id,
                title: updated.title,
                plan,
            });
            (0, bot_1.notifyApprovalNeeded)(updated.id, updated.title, plan).catch(() => { });
            res.json(updated);
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // ── ask_developer reply endpoint (called by Telegram bot polling) ───────────
    router.post("/agent/tasks/:id/ask", requireWorkspaceToken, async (req, res) => {
        try {
            const { question } = zod_1.z.object({ question: zod_1.z.string().min(1) }).parse(req.body);
            const task = tasks_1.taskQueries.getTask(req.params.id);
            if (!task) {
                res.status(404).json({ error: "Task not found" });
                return;
            }
            await (0, bot_1.askDeveloper)(task.id, task.title, question);
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    router.post("/agent/tasks/:id/reply", requireWorkspaceToken, (req, res) => {
        try {
            const { reply } = zod_1.z.object({ reply: zod_1.z.string().min(1) }).parse(req.body);
            const task = tasks_1.taskQueries.getTask(req.params.id);
            if (!task) {
                res.status(404).json({ error: "Task not found" });
                return;
            }
            db_1.db.prepare("UPDATE tasks SET developer_reply = ?, updated_at = ? WHERE id = ?")
                .run(reply, Math.floor(Date.now() / 1000), task.id);
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: String(err) });
        }
    });
    // Screenshot serving — base64 stored in DB, served as PNG
    router.get("/tasks/:id/screenshot", tokens_1.requireAuth, (req, res) => {
        const task = tasks_1.taskQueries.getTask(req.params.id);
        if (!task || !task.screenshot_base64) {
            res.status(404).json({ error: "No screenshot for this task" });
            return;
        }
        const buf = Buffer.from(task.screenshot_base64, "base64");
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", buf.length);
        res.send(buf);
    });
    return router;
}
//# sourceMappingURL=routes.js.map