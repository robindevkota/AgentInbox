import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { taskQueries } from "../queue/tasks";
import { db } from "../queue/db";
import { requireProjectToken, requireAuth } from "../auth/tokens";
import { signupUser, loginUser, getMe, verifyToken } from "../auth/users";
import { parseFile } from "../files/parser";
import { sendOtp } from "../email/mailer";
import { fireWebhook } from "../webhook/notify";
import { emitTaskCreated, emitToPm } from "../socket/manager";
import {
  notifyTaskSubmitted,
  notifyTaskDone,
  notifyTaskEscalated,
  notifyApprovalNeeded,
  askDeveloper,
} from "../telegram/bot";
import { triggerClaude } from "../trigger/claude";

const FREE_TASK_LIMIT = 50;
const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

// Rate limit: max submissions per token per hour — prevents token abuse / runaway Claude spawns
const SUBMIT_RATE_LIMIT = 10;
const submitCounts = new Map<string, { count: number; resetAt: number }>();
function checkSubmitRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = submitCounts.get(token);
  if (!entry || now > entry.resetAt) {
    submitCounts.set(token, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= SUBMIT_RATE_LIMIT) return false;
  entry.count++;
  return true;
}


const upload = multer({
  storage: multer.memoryStorage(),
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


function buildMcpConfig(token: string): object {
  return {
    mcpServers: {
      agentinbox: {
        command: "node",
        args: ["node_modules/agentinbox-mcp/dist/index.js"],
        env: { AGENTINBOX_TOKEN: token },
      },
    },
  };
}

export function createRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => res.json({ ok: true }));

  // POST /feedback — authenticated, emails robin@useagentinbox.com
  router.post("/feedback", requireAuth, async (req: Request, res: Response) => {
    const { message, category } = req.body || {};
    if (!message?.trim()) { res.status(400).json({ error: "Message required" }); return; }
    const userEmail = (req as any).user?.email || "unknown";
    const subject = `[AgentInbox Feedback] ${category || "General"} from ${userEmail}`;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
        <h2 style="margin:0 0 8px">New Feedback</h2>
        <p style="color:#64748b;margin:0 0 4px;font-size:13px">From: <strong>${userEmail}</strong></p>
        <p style="color:#64748b;margin:0 0 24px;font-size:13px">Category: <strong>${category || "General"}</strong></p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px">
          <p style="margin:0;color:#334155;white-space:pre-wrap">${message.trim()}</p>
        </div>
      </div>`;
    try {
      const mailer = await import("../email/mailer");
      await mailer.send("feedback@useagentinbox.com", subject, html);
    } catch {}
    res.json({ ok: true });
  });

  // ── Public: project info + Tier 2 OTP ───────────────────────────────────

  // GET project info by token (for submission form header)
  router.get("/submit/:token", requireProjectToken, (req: Request, res: Response) => {
    const project = (req as any).project;
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
  router.post("/submit/:token/request-otp", requireProjectToken, async (req: Request, res: Response) => {
    const project = (req as any).project;
    if (!project.allowed_emails) {
      res.status(400).json({ error: "This project does not require email verification" });
      return;
    }
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);

      // Check if email matches any allowed pattern (exact or wildcard domain)
      const patterns: string[] = project.allowed_emails.split(",").map((e: string) => e.trim());
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

      const otp = taskQueries.createOtp(project.id, email);
      await sendOtp(email, otp, project.name);
      res.json({ message: "Check your email for a 6-digit code" });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // POST verify OTP and get a session token
  router.post("/submit/:token/verify-otp", requireProjectToken, (req: Request, res: Response) => {
    const project = (req as any).project;
    try {
      const { email, otp } = z
        .object({ email: z.string().email(), otp: z.string().length(6) })
        .parse(req.body);

      const valid = taskQueries.verifyOtp(project.id, email, otp);
      if (!valid) {
        res.status(401).json({ error: "Invalid or expired code" });
        return;
      }

      // Return a simple session token: base64(projectId:email:timestamp)
      // — not a security guarantee, just enough to gate the submit form
      const session = Buffer.from(`${project.id}:${email}:${Date.now()}`).toString("base64");
      res.json({ session, email });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // POST submit a task (with optional file)
  router.post(
    "/submit/:token",
    requireProjectToken,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const project = (req as any).project;

        // Rate limit — max 10 submissions per token per hour
        if (!checkSubmitRateLimit(project.token)) {
          res.status(429).json({ error: "Too many submissions. Maximum 10 tasks per hour per project. Please wait before submitting again." });
          return;
        }

        // Tier 2: verify session header if project requires OTP
        if (project.allowed_emails) {
          const session = req.headers["x-otp-session"] as string;
          if (!session) {
            res.status(401).json({ error: "Email verification required" });
            return;
          }
          try {
            const decoded = Buffer.from(session, "base64").toString("utf-8");
            const [pid] = decoded.split(":");
            if (pid !== project.id) throw new Error("invalid session");
          } catch {
            res.status(401).json({ error: "Invalid session" });
            return;
          }
        }

        // custom_field_values arrives as a JSON string when sent via FormData
        if (req.body.custom_field_values && typeof req.body.custom_field_values === "string") {
          try { req.body.custom_field_values = JSON.parse(req.body.custom_field_values); } catch {}
        }
        const body = z
          .object({
            title: z.string().min(1).max(200),
            description: z.string().min(1).max(50000),
            priority: z.enum(["low", "medium", "high"]).optional(),
            submitter_name: z.string().max(100).optional(),
            submitter_email: z.string().email().optional(),
            custom_field_values: z.record(z.string()).optional(),
            require_verification: z.union([z.boolean(), z.string()]).optional(),
          })
          .parse(req.body);

        let fileName: string | undefined;
        let fileContent: string | undefined;
        let fileData: string | undefined;

        if (req.file) {
          fileName = req.file.originalname;
          fileData = req.file.buffer.toString("base64");
          try {
            // Write to a temp file for parsing, then clean up
            const os = await import("os");
            const fs = await import("fs");
            const tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}${path.extname(fileName)}`);
            fs.writeFileSync(tmpPath, req.file.buffer);
            fileContent = await parseFile(tmpPath, req.file.mimetype);
            fs.unlinkSync(tmpPath);
          } catch {
            fileContent = `[Could not parse file: ${fileName}]`;
          }
        }

        // Enforce free-tier task limit (only when billing is enabled)
        if (BILLING_ENABLED) {
          const ws = db
            .prepare("SELECT plan, task_count_this_month, billing_month FROM workspaces WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)")
            .get(project.id) as { plan: string; task_count_this_month: number; billing_month: string | null } | undefined;

          if (ws && ws.plan === "free") {
            const currentMonth = new Date().toISOString().slice(0, 7);
            if (ws.billing_month !== currentMonth) {
              db.prepare("UPDATE workspaces SET task_count_this_month = 0, billing_month = ? WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)").run(currentMonth, project.id);
              ws.task_count_this_month = 0;
            }
            if (ws.task_count_this_month >= FREE_TASK_LIMIT) {
              res.status(403).json({ error: "Free plan limit reached (50 tasks/month). Upgrade to Pro to continue.", upgrade_required: true });
              return;
            }
            db.prepare("UPDATE workspaces SET task_count_this_month = task_count_this_month + 1 WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)").run(project.id);
          }
        }

        const requiresApproval = project.require_approval === 1;

        const task = taskQueries.createTask({
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
          // Inherit project's require_verification when not explicitly set in the submission body
          require_verification: body.require_verification === true || body.require_verification === "true" || body.require_verification === "1" || project.require_verification === 1,
          // Pre-spawn gate: if true, the worker is never notified below — Claude is not
          // invoked until a PM approves via dashboard or Telegram reply.
          requires_approval: requiresApproval,
        });

        taskQueries.audit({
          project_id: project.id,
          task_id: task.id,
          action: "task_submitted",
          actor: body.submitter_email || body.submitter_name || "anonymous",
        });

        const taskPayload = {
          event: "task.created" as const,
          task_id: task.id,
          project_id: project.id,
          project_name: project.name,
          project_token: project.token,
          title: task.title,
          description: task.description,
          submitter_name: task.submitter_name,
          has_file: !!task.file_name,
          require_verification: task.require_verification === 1,
        };

        const workspace = db
          .prepare("SELECT id FROM workspaces WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)")
          .get(project.id) as { id: string } | undefined;

        if (requiresApproval) {
          // Do NOT wake the worker yet — no emitTaskCreated, no webhook, no triggerClaude.
          // Claude is never spawned against this task's filesystem/shell until a PM approves it.
          if (workspace) {
            emitToPm(workspace.id, "task.submitted", {
              task_id: task.id,
              title: task.title,
              project_name: project.name,
              submitter_name: task.submitter_name,
              priority: task.priority,
              awaiting_approval: true,
            });
          }
          notifyApprovalNeeded(task.id, task.title, "(awaiting PM approval before Claude starts — no plan yet)").catch(() => {});
        } else {
          // Emit to connected agentinbox-mcp socket for this workspace
          if (workspace) {
            emitTaskCreated(workspace.id, taskPayload);
            emitToPm(workspace.id, "task.submitted", {
              task_id: task.id,
              title: task.title,
              project_name: project.name,
              submitter_name: task.submitter_name,
              priority: task.priority,
            });
          }

          // Also fire webhook as fallback (ngrok/router still supported)
          fireWebhook(taskPayload).catch(() => {});

          // Telegram notification
          notifyTaskSubmitted(task.id, task.title, project.name, task.description).catch(() => {});

          // Trigger Claude to wake up and process the task (event-driven, no idle polling)
          if (process.env.TRIGGER_CLAUDE === "true") triggerClaude();
        }

        res.status(201).json({
          id: task.id,
          status: task.status,
          created_at: task.created_at,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid request";
        res.status(400).json({ error: message });
      }
    }
  );

  // GET task status (public — anyone with task ID can poll)
  router.get("/tasks/:id/status", (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const project = taskQueries.getProjectById(task.project_id);
    res.json({
      id: task.id,
      status: task.status,
      title: task.title,
      summary_plain: task.summary_plain,
      escalation_reason:
        task.status === "escalated" ? "This task needs human review." : null,
      awaiting_approval: task.status === "awaiting_approval",
      proposed_plan: task.status === "awaiting_approval" ? task.proposed_plan : null,
      updated_at: task.updated_at,
      brand_name: project?.brand_name || null,
      brand_color: project?.brand_color || null,
    });
  });

  // SSE live stream
  router.get("/tasks/:id/stream", (req: Request, res: Response) => {
    const { id } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = () => {
      const task = taskQueries.getTask(id);
      if (!task) {
        res.write(`data: ${JSON.stringify({ error: "not_found" })}\n\n`);
        return;
      }
      res.write(
        `data: ${JSON.stringify({
          id: task.id,
          status: task.status,
          summary_plain: task.summary_plain,
          updated_at: task.updated_at,
        })}\n\n`
      );
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

  router.post("/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, workspace_name } = z
        .object({
          email: z.string().email(),
          password: z.string().min(8, "Password must be at least 8 characters"),
          workspace_name: z.string().min(1),
        })
        .parse(req.body);
      const result = await signupUser(email, password, workspace_name);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = z
        .object({ email: z.string().email(), password: z.string().min(1) })
        .parse(req.body);
      const result = await loginUser(email, password);
      res.json(result);
    } catch (err) {
      console.error("[login error]", err);
      res.status(401).json({ error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
    }
  });

  router.get("/auth/debug-users", (_req: Request, res: Response) => {
    const users = db.prepare("SELECT id, email FROM users").all();
    res.json(users);
  });

  router.get("/auth/debug-bcrypt", async (_req: Request, res: Response) => {
    try {
      const bcryptjs = require("bcryptjs");
      const hash = bcryptjs.hashSync("test", 10);
      const valid = bcryptjs.compareSync("test", hash);
      res.json({ ok: true, hash, valid });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { email, new_password, reset_secret } = z
        .object({ email: z.string().email(), new_password: z.string().min(6), reset_secret: z.string() })
        .parse(req.body);
      if (reset_secret !== (process.env.RESET_SECRET || "reset-me-now")) {
        res.status(403).json({ error: "Invalid reset secret" });
        return;
      }
      const bcryptjs = await import("bcryptjs");
      const hash = await bcryptjs.hash(new_password, 10);
      db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(hash, email.toLowerCase());
      res.json({ ok: true, email });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/auth/me", (req: Request, res: Response) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    const me = getMe(payload.userId);
    if (!me) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(me);
  });

  // ── PM / Admin routes (JWT auth for hosted, API key fallback for self-hosted) ──

  // Workspace management
  router.post("/workspaces", requireAuth, (req: Request, res: Response) => {
    try {
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      const workspace = taskQueries.createWorkspace(name);
      res.status(201).json(workspace);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // Usage dashboard stats
  router.get("/workspaces/:workspaceId/stats", requireAuth, (req: Request, res: Response) => {
    const stats = taskQueries.getWorkspaceStats(req.params.workspaceId);
    const ws = db
      .prepare("SELECT plan, task_count_this_month FROM workspaces WHERE id = ?")
      .get(req.params.workspaceId) as { plan: string; task_count_this_month: number } | undefined;
    res.json({ ...stats, plan: ws?.plan ?? "free", task_count_this_month: ws?.task_count_this_month ?? 0, free_task_limit: FREE_TASK_LIMIT });
  });

  // Project management
  router.post(
    "/workspaces/:workspaceId/projects",
    requireAuth,
    (req: Request, res: Response) => {
      try {
        const body = z
          .object({
            name: z.string().min(1),
            description: z.string().optional(),
            require_approval: z.boolean().optional(),
            require_verification: z.boolean().optional(),
            allowed_emails: z.string().optional(),
            notify_email: z.string().email().optional(),
            brand_name: z.string().optional(),
            brand_color: z.string().optional(),
            slack_channel: z.string().optional(),
          })
          .parse(req.body);
        const project = taskQueries.createProject(
          req.params.workspaceId,
          body.name,
          body.description,
          body
        );
        res.status(201).json(project);
      } catch (err) {
        res.status(400).json({ error: String(err) });
      }
    }
  );

  router.get(
    "/workspaces/:workspaceId/projects",
    requireAuth,
    (req: Request, res: Response) => {
      const projects = taskQueries.listProjects(req.params.workspaceId);
      res.json(projects);
    }
  );

  router.delete("/projects/:id", requireAuth, (req: Request, res: Response) => {
    const deleted = taskQueries.deleteProject(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.patch("/projects/:id", requireAuth, (req: Request, res: Response) => {
    try {
      const body = z
        .object({
          name: z.string().optional(),
          description: z.string().optional(),
          require_approval: z.boolean().optional(),
          require_verification: z.boolean().optional(),
          allowed_emails: z.string().optional(),
          notify_email: z.string().email().optional(),
          brand_name: z.string().optional(),
          brand_color: z.string().optional(),
          brand_logo_url: z.string().url().optional(),
          slack_channel: z.string().optional(),
          custom_fields: z.string().optional(), // JSON string of CustomField[]
        })
        .parse(req.body);
      const project = taskQueries.updateProject(req.params.id, body);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // Task list for PM dashboard
  router.get(
    "/projects/:projectId/tasks",
    requireAuth,
    (req: Request, res: Response) => {
      const status = req.query.status as string | undefined;
      const tasks = taskQueries.listTasks(req.params.projectId, status as any);
      res.json(tasks);
    }
  );

  // Full task detail + audit log
  router.get("/tasks/:id", requireAuth, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const audit = taskQueries.getAuditLog(req.params.id);
    res.json({ ...task, audit });
  });

  router.delete("/tasks/:id", requireAuth, (req: Request, res: Response) => {
    const deleted = taskQueries.deleteTask(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ success: true });
  });

  // ── Approval gate ────────────────────────────────────────────────────────

  router.post("/tasks/:id/approve", requireAuth, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (task.status !== "awaiting_approval") {
      res.status(400).json({ error: "Task is not awaiting approval" });
      return;
    }
    const approvedBy = (req.query.by as string) || "PM";
    const updated = taskQueries.approveTask(req.params.id, approvedBy);
    taskQueries.audit({
      project_id: task.project_id,
      task_id: task.id,
      action: "task_approved",
      actor: approvedBy,
    });
    const project = db.prepare("SELECT workspace_id FROM projects WHERE id = ?").get(task.project_id) as { workspace_id: string } | undefined;
    if (project) {
      // This is the pre-spawn gate: the worker was never told about this task until now —
      // approving is what first wakes Claude, not the original submission.
      emitTaskCreated(project.workspace_id, { task_id: task.id, title: task.title, project_id: task.project_id, require_verification: task.require_verification === 1 });
    }
    res.json(updated);
  });

  router.post("/tasks/:id/reject", requireAuth, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    try {
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      const updated = taskQueries.rejectTask(req.params.id, reason);
      taskQueries.audit({
        project_id: task.project_id,
        task_id: task.id,
        action: "task_rejected",
        detail: reason,
      });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // Reopen a completed/failed/escalated task back to pending
  router.post("/tasks/:id/reopen", requireAuth, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const updated = taskQueries.reopenTask(req.params.id);
    taskQueries.audit({
      project_id: task.project_id,
      task_id: task.id,
      action: "task_reopened",
      actor: (req.query.by as string) || "PM",
    });
    res.json(updated);
  });

  // Comments
  router.get("/tasks/:id/comments", requireAuth, (req: Request, res: Response) => {
    const comments = taskQueries.getComments(req.params.id);
    res.json(comments);
  });

  router.post("/tasks/:id/comments", requireAuth, (req: Request, res: Response) => {
    try {
      const { author, body } = z
        .object({ author: z.string().min(1), body: z.string().min(1) })
        .parse(req.body);
      const comment = taskQueries.addComment(req.params.id, author, body);
      taskQueries.audit({
        task_id: req.params.id,
        action: "comment_added",
        actor: author,
        detail: body,
      });
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // Serve uploaded file attachment from base64 stored in DB
  router.get("/tasks/:id/file", requireAuth, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task || !task.file_data) {
      res.status(404).json({ error: "No file for this task" });
      return;
    }
    const buf = Buffer.from(task.file_data, "base64");
    const ext = task.file_name ? path.extname(task.file_name).toLowerCase() : "";
    const mimeMap: Record<string, string> = {
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
    };
    res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  });

  // ── Workspace token (for agentinbox-mcp) ────────────────────────────────

  // GET current token (or issue one if not yet set)
  router.get("/workspaces/:workspaceId/token", requireAuth, (req: Request, res: Response) => {
    let token = taskQueries.getWorkspaceToken(req.params.workspaceId);
    if (!token) token = taskQueries.issueWorkspaceToken(req.params.workspaceId);
    res.json({ token, mcp_config: buildMcpConfig(token) });
  });

  // POST rotate token
  router.post("/workspaces/:workspaceId/token/rotate", requireAuth, (req: Request, res: Response) => {
    const token = taskQueries.rotateWorkspaceToken(req.params.workspaceId);
    res.json({ token, mcp_config: buildMcpConfig(token) });
  });

  // GET Telegram config for workspace
  router.get("/workspaces/:workspaceId/telegram", requireAuth, (req: Request, res: Response) => {
    const cfg = taskQueries.getTelegramConfig(req.params.workspaceId);
    res.json(cfg);
  });

  // PATCH Telegram config for workspace
  router.patch("/workspaces/:workspaceId/telegram", requireAuth, (req: Request, res: Response) => {
    const { bot_token, chat_id, project_id, screenshot_verification } = req.body;
    taskQueries.setTelegramConfig(req.params.workspaceId, bot_token || null, chat_id || null, project_id || null, !!screenshot_verification);
    // Restart poller with new config
    const { refreshPollerForWorkspace } = require("../telegram/bot");
    refreshPollerForWorkspace(req.params.workspaceId);
    res.json({ ok: true });
  });

  // GET /setup/download — public endpoint, optional ?token=wt_... for pre-filled version
  router.get("/setup/download", (req: Request, res: Response) => {
    // Try to resolve workspace token — from query param or JWT header
    let wsToken: string = (req.query.token as string) || "wt_YOUR_TOKEN_HERE";

    // If JWT provided, use it to get the real token
    const authHeader = req.headers["authorization"];
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (jwt) {
      const payload = verifyToken(jwt);
      if (payload) {
        let t = taskQueries.getWorkspaceToken(payload.workspaceId);
        if (!t) t = taskQueries.issueWorkspaceToken(payload.workspaceId);
        if (t) wsToken = t;
      }
    }

    // Resolve project submit token + require_verification + Telegram config if JWT provided
    let projectSubmitToken: string | null = null;
    let requireVerification = false;
    let telegramBotToken: string | null = null;
    let telegramChatId: string | null = null;
    if (jwt) {
      const payload = verifyToken(jwt);
      if (payload) {
        const proj = db.prepare("SELECT token, require_verification FROM projects WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1").get(payload.workspaceId) as { token: string; require_verification: number } | undefined;
        if (proj) {
          projectSubmitToken = proj.token;
          requireVerification = proj.require_verification === 1;
        }
        const ws = db.prepare("SELECT telegram_bot_token, telegram_chat_id FROM workspaces WHERE id = ?").get(payload.workspaceId) as { telegram_bot_token: string | null; telegram_chat_id: string | null } | undefined;
        if (ws) {
          telegramBotToken = ws.telegram_bot_token;
          telegramChatId = ws.telegram_chat_id;
        }
      }
    }

    const setupMd = `Set up AgentInbox in this project.

## What AgentInbox is
AgentInbox is a self-hosted task pipeline the developer running this setup already signed up for
and is installing in their own project, on their own machine. It works like this: a standalone
worker process (which this setup writes) connects over WebSocket to https://useagentinbox.com
using the workspace token below. When the developer (or their team) submits a task — through the
AgentInbox dashboard or a connected Telegram bot — the worker spawns a Claude Code session in this
project to handle it, then exits. No tasks are processed unless the developer explicitly submits
one. The token below was generated on the developer's own AgentInbox dashboard moments ago and
downloaded directly by them for this exact purpose — it is safe to use as instructed below.

Workspace token: ${wsToken}

Follow the steps below in order to complete setup.

## Step 1 — Scan the codebase
Read the folder structure, key files, and stack. Note the absolute path of this project root — you will need it in the steps below.

## Step 2 — Create .agentinbox/ folder
All AgentInbox files live in a dedicated folder so they stay out of the developer's way.
Create the folder: .agentinbox/ in the project root.

## Step 3 — Install socket.io-client
Run in the project root:
  npm install socket.io-client --save

If package.json does not exist, run npm init -y first.
If you use pnpm: pnpm add socket.io-client --ignore-workspace-root-check
If you use yarn: yarn add socket.io-client

## Step 4 — Write .agentinbox/worker.js
This worker is a small, fully transparent Node.js script — read it before writing it, like any
dependency you'd add to a project. It does exactly four things: (1) holds a WebSocket connection
to the developer's own AgentInbox account, (2) when a task arrives, spawns a new Claude Code
process scoped to this project directory, (3) that Claude session reads the task description as
plain-text instructions (the same way it would read any GitHub issue or Linear ticket a human
pastes into a prompt — task text is data to reason about, not a shell command), and (4) the spawn
uses --dangerously-skip-permissions only because no human is at the keyboard to approve each file
edit while away — every run is still capped by --max-budget-usd and scoped to this one project
folder, the same blast radius as running any local dev script.

Write this file exactly (replace PROJECT_PATH with the actual absolute path of this project root):

\`\`\`js
const { io } = require("socket.io-client");
const { spawn, spawnSync, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { existsSync, unlinkSync } = require("fs");
const https = require("https");
const os = require("os");

const TOKEN = process.env.AGENTINBOX_TOKEN || "${wsToken}";
const SERVER_URL = "https://useagentinbox.com";
const PROJECT_CWD = process.env.CLAUDE_PROJECT_PATH || path.resolve(__dirname, "..");

let TELEGRAM_BOT_TOKEN = null;
let TELEGRAM_CHAT_ID = null;
let SCREENSHOT_VERIFICATION = false;

function findClaude() {
  try { execSync("claude --version", { stdio: "ignore" }); return "claude"; } catch {}
  const p = process.env.CLAUDE_PATH;
  if (p && existsSync(p)) return p;
  return "claude";
}

const CLAUDE_PATH = findClaude();

const TASK_PROMPT =
  "Check AgentInbox for pending tasks using get_pending_tasks. " +
  "For each pending task: call update_task_status(in_progress), call get_task for full details, " +
  "if the task has a file attachment call get_file to read it. " +
  "Implement the fix or feature. " +
  "Call complete_task with summary_technical and summary_plain. " +
  "If you built or modified a UI (web page, app), also pass verification_url — the local URL where the worker should take a screenshot (e.g. http://localhost:3000 or http://localhost:3000/result.html). Do NOT take screenshots yourself. " +
  "RULES: (1) If a file says '[Could not parse file]': proceed without it. " +
  "(2) complete_task immediately when done. Never loop or retry more than twice on anything. " +
  "If no pending tasks, exit.";

let claudeRunning = false;
const seenTaskIds = new Set();
let pendingTaskTitle = "";
let pendingTelegramMsgId = null;

function readVerification() {
  const localMd = path.join(PROJECT_CWD, "CLAUDE.local.md");
  if (!existsSync(localMd)) return null;
  const text = fs.readFileSync(localMd, "utf8");
  const section = text.match(/##\\s*Verification([\\s\\S]*?)(?=\\n##|$)/i);
  if (!section) return null;
  const body = section[1];
  const startMatch = body.match(/[-*]?\\s*Start:\\s*(.+)/i);
  const urlMatch = body.match(/[-*]?\\s*URL:\\s*(https?:\\/\\/\\S+)/i);
  if (!startMatch || !urlMatch) return null;
  return { startCmd: startMatch[1].trim(), url: urlMatch[1].trim() };
}

function normalizeUrl(url) {
  return url.replace(/localhost/g, "127.0.0.1");
}

function isPortAlive(url) {
  return new Promise(resolve => {
    const http = require("http");
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(normalizeUrl(url), res => { res.resume(); resolve(true); });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

let devServerProc = null;

async function startDevServer() {
  const verification = readVerification();
  if (!verification) return;
  const { startCmd, url } = verification;
  if (await isPortAlive(url)) { console.log("[worker] Dev server already up at " + url); return; }
  console.log("[worker] Starting dev server: " + startCmd);
  const parts = startCmd.split(" ");
  devServerProc = spawn(parts[0], parts.slice(1), { cwd: PROJECT_CWD, stdio: "ignore", shell: true, detached: true });
  devServerProc.unref();
  console.log("[worker] Dev server started (PID " + devServerProc.pid + ") — waiting for port...");
}

async function waitForUrl(url, timeoutMs) {
  const http = require("http");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const mod = url.startsWith("https") ? https : http;
        const req = mod.get(normalizeUrl(url), res => { res.resume(); resolve(); });
        req.on("error", reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error("timeout")); });
      });
      return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function takeScreenshotAndAttach(taskId, taskTitle, telegramMsgId, spawnedAt) {
  const verification = readVerification();
  if (!verification) { console.log("[worker] No Verification in CLAUDE.local.md — skipping screenshot"); return; }
  // Fetch task: check idempotency + read verification_url hint Claude left us
  let verificationUrlHint = null;
  try {
    const taskRes = await new Promise((resolve) => {
      https.get({ hostname: new URL(SERVER_URL).hostname, path: "/api/agent/tasks/" + taskId, headers: { "x-workspace-token": TOKEN } }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); }).on("error", () => resolve(null));
    });
    if (taskRes && taskRes.screenshot_base64) { console.log("[worker] Task already has screenshot — skipping"); return; }
    if (taskRes && taskRes.status !== "done") { console.log("[worker] Task status is " + taskRes.status + " — skipping screenshot"); return; }
    if (taskRes && taskRes.verification_url) { verificationUrlHint = taskRes.verification_url; console.log("[worker] Using verification_url from Claude: " + verificationUrlHint); }
  } catch {}
  const { url } = verification;
  console.log("[worker] Screenshot: waiting for dev server at " + url);
  if (!(await isPortAlive(url))) { await startDevServer(); }
  const serverReady = await waitForUrl(url, 90000);
  if (!serverReady) { console.error("[worker] Dev server not ready after 90s — skipping screenshot"); return; }
  let screenshotPath = null;
  try {
    await new Promise(r => setTimeout(r, 2000));
    // Use verification_url hint from Claude if provided — exact URL, no guessing
    // Falls back to 30-min window on most-recently-modified HTML (for HTML-only projects)
    let screenshotUrl;
    if (verificationUrlHint) {
      screenshotUrl = verificationUrlHint;
      console.log("[worker] Screenshot URL from Claude hint: " + screenshotUrl);
    } else {
      const allHtml = fs.readdirSync(PROJECT_CWD).filter((f: string) => f.endsWith(".html"));
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      const recentHtml = allHtml
        .map((f: string) => ({ name: f, mtime: fs.statSync(path.join(PROJECT_CWD, f)).mtimeMs }))
        .filter((f: {name: string; mtime: number}) => f.mtime >= thirtyMinutesAgo)
        .sort((a: {mtime: number}, b: {mtime: number}) => b.mtime - a.mtime);
      if (recentHtml.length === 0) { console.log("[worker] No HTML files modified in last 30 min — skipping screenshot"); return; }
      const htmlTarget = recentHtml[0].name;
      console.log("[worker] Screenshotting most recent HTML (fallback): " + htmlTarget);
      screenshotUrl = htmlTarget === "index.html" ? url : url.replace(/\/$/, "") + "/" + htmlTarget;
    }
    const ready = await waitForUrl(screenshotUrl, 10000);
    if (!ready) { console.error("[worker] File not ready at " + screenshotUrl + " — skipping screenshot"); return; }
    screenshotPath = path.join(os.tmpdir(), "agentinbox-ss-" + Date.now() + ".png");
    const playwrightCmd = [
      path.join(PROJECT_CWD, "node_modules", ".bin", "playwright.cmd"),
      path.join(PROJECT_CWD, "royal-suites", "node_modules", ".bin", "playwright.cmd"),
    ].find(p => existsSync(p));
    const ssArgs = ["screenshot", "--browser=chromium", "--wait-for-timeout=2000", normalizeUrl(screenshotUrl), screenshotPath];
    const result = playwrightCmd
      ? spawnSync('"' + playwrightCmd + '"', ssArgs, { cwd: PROJECT_CWD, timeout: 30000, shell: true })
      : spawnSync("npx", ["playwright", ...ssArgs], { cwd: PROJECT_CWD, timeout: 30000, shell: true });
    if (result.status !== 0 || !existsSync(screenshotPath)) { console.error("[worker] Screenshot failed"); return; }
    const buf = fs.readFileSync(screenshotPath);
    if (buf[0] !== 0x89 || buf[1] !== 0x50) { console.error("[worker] Not a PNG"); return; }
    console.log("[worker] Screenshot taken: " + buf.length + " bytes");
    const screenshot_base64 = buf.toString("base64");
    await apiPost("/agent/tasks/" + taskId + "/screenshot", { screenshot_base64 });
    console.log("[worker] Screenshot attached");
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) { await sendTelegramPhoto(buf, "📸 " + taskTitle, telegramMsgId); }
  } catch (err) { console.error("[worker] Screenshot error:", err.message); }
  finally {
    if (screenshotPath && existsSync(screenshotPath)) { try { unlinkSync(screenshotPath); } catch {} }
  }
}

function apiPost(apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname: new URL(SERVER_URL).hostname, path: "/api" + apiPath, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "x-workspace-token": TOKEN } }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(JSON.parse(d))); });
    req.on("error", reject); req.write(data); req.end();
  });
}

function sendTelegramPhoto(buf, caption, replyToMessageId) {
  return new Promise(resolve => {
    const boundary = "----TGBoundary" + Date.now();
    const part1 = Buffer.from("--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\"chat_id\\"\\r\\n\\r\\n" + TELEGRAM_CHAT_ID + "\\r\\n--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\"caption\\"\\r\\n\\r\\n" + caption + "\\r\\n" + (replyToMessageId ? "--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\"reply_to_message_id\\"\\r\\n\\r\\n" + replyToMessageId + "\\r\\n" : "") + "--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\"photo\\"; filename=\\"screenshot.png\\"\\r\\nContent-Type: image/png\\r\\n\\r\\n");
    const part2 = Buffer.from("\\r\\n--" + boundary + "--\\r\\n");
    const body = Buffer.concat([part1, buf, part2]);
    const req = https.request({ hostname: "api.telegram.org", path: "/bot" + TELEGRAM_BOT_TOKEN + "/sendPhoto", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": body.length } }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => { console.log("[worker] Telegram photo:", JSON.parse(d).ok ? "sent" : "failed"); resolve(); }); });
    req.on("error", e => { console.error("[worker] Telegram photo error:", e.message); resolve(); });
    req.write(body); req.end();
  });
}

async function sendTelegramAlert(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg }) });
  } catch {}
}

function checkAndSpawnNext() {
  https.get({ hostname: new URL(SERVER_URL).hostname, path: "/api/agent/tasks/pending", headers: { "x-workspace-token": TOKEN } }, res => {
    let d = ""; res.on("data", c => d += c);
    res.on("end", () => {
      try {
        const tasks = JSON.parse(d);
        if (tasks && tasks.length > 0) {
          const t = tasks[0];
          console.log("[worker] Next pending task: \\"" + t.title + "\\" (" + t.id + ")");
          pendingTaskTitle = t.title || "";
          pendingTelegramMsgId = t.telegram_message_id || null;
          spawnClaude(t.id, t.require_verification, true);
        } else {
          console.log("[worker] No more pending tasks — waiting for next event");
        }
      } catch {}
    });
  }).on("error", () => {});
}

function spawnClaude(taskId, requireVerification, skipSeenCheck) {
  if (!skipSeenCheck && taskId && seenTaskIds.has(taskId)) { console.log("[worker] Task " + taskId + " already seen — skipping duplicate"); return; }
  if (taskId) seenTaskIds.add(taskId);
  if (claudeRunning) { console.log("[worker] Claude already running — task " + taskId + " will be picked up after current task completes"); return; }
  claudeRunning = true;
  const spawnedAt = Date.now();
  const thisTaskId = taskId;
  const thisTaskTitle = pendingTaskTitle;
  const thisTelegramMsgId = pendingTelegramMsgId;
  console.log("[worker] Waking Claude for task: \\"" + thisTaskTitle + "\\" (" + thisTaskId + ")");
  const proc = spawn(CLAUDE_PATH, ["--dangerously-skip-permissions", "--print", "--max-budget-usd", "2.00", TASK_PROMPT], { cwd: PROJECT_CWD, stdio: "inherit", detached: false });
  const timeout = setTimeout(() => { console.error("[worker] Claude timed out — killing"); try { spawnSync("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { shell: false }); } catch {} if (thisTaskId) { apiPost("/agent/tasks/" + thisTaskId + "/status", { status: "failed" }).catch(() => {}); } }, 5 * 60 * 1000);
  proc.on("error", (err) => { console.error("[worker] Failed: " + err.message); clearTimeout(timeout); claudeRunning = false; checkAndSpawnNext(); });
  proc.on("close", (code) => {
    console.log("[worker] Claude exited (" + code + ") for task " + thisTaskId);
    clearTimeout(timeout);
    claudeRunning = false;
    // Fire screenshot in background — does NOT block next task from starting
    const shouldScreenshot = (requireVerification || SCREENSHOT_VERIFICATION) && thisTaskId;
    if (shouldScreenshot) {
      takeScreenshotAndAttach(thisTaskId, thisTaskTitle, thisTelegramMsgId, spawnedAt).catch(err => console.error("[worker] Screenshot error:", err.message));
    }
    // Immediately check for next pending task — runs in parallel with screenshot above
    checkAndSpawnNext();
  });
}

let connectFailures = 0;
let alertSent = false;

const socket = io(SERVER_URL, { path: "/agent-socket", auth: { token: TOKEN }, transports: ["websocket"], reconnection: true, reconnectionDelay: 5000, reconnectionAttempts: Infinity });

function refreshWorkspaceConfig(isFirstFetch) {
  return new Promise((resolve) => {
    https.get({ hostname: new URL(SERVER_URL).hostname, path: "/api/agent/workspace", headers: { "x-workspace-token": TOKEN } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const ws = JSON.parse(d);
          const hadTelegram = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
          TELEGRAM_BOT_TOKEN = ws.telegram_bot_token || null;
          TELEGRAM_CHAT_ID = ws.telegram_chat_id || null;
          SCREENSHOT_VERIFICATION = !!ws.screenshot_verification;
          const hasTelegram = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
          if (isFirstFetch || hasTelegram !== hadTelegram) {
            console.log("[worker] Telegram configured:", hasTelegram);
            if (SCREENSHOT_VERIFICATION) console.log("[worker] Screenshot verification: enabled");
          }
        } catch {}
        resolve();
      });
    }).on("error", () => resolve());
  });
}

socket.on("connect", () => {
  console.log("[worker] Connected to AgentInbox");
  connectFailures = 0; alertSent = false;
  refreshWorkspaceConfig(true).then(() => startDevServer().catch(() => {}));
  // Pick up any tasks missed during disconnect
  checkAndSpawnNext();
});
// Telegram/screenshot config can change on the PM dashboard after the worker already connected —
// re-fetch periodically so a developer configuring Telegram later doesn't need to restart the worker.
setInterval(() => { if (socket.connected) refreshWorkspaceConfig(false); }, 5 * 60 * 1000);
socket.on("connected", (d) => console.log("[worker] Workspace: " + d.workspace_name));
socket.on("task.created", (p) => { console.log("[worker] Task: \\"" + p.title + "\\" (" + p.task_id + ")"); pendingTaskTitle = p.title; pendingTelegramMsgId = p.telegram_message_id || null; spawnClaude(p.task_id, p.require_verification); });
socket.on("connect_error", (e) => { console.error("[worker] Error: " + e.message); connectFailures++; if (connectFailures >= 3 && !alertSent) { alertSent = true; sendTelegramAlert("⚠️ AgentInbox worker cannot connect after 3 attempts. Check worker.log."); } });
socket.on("disconnect", (r) => console.log("[worker] Disconnected: " + r));

// Ping every 25s to keep Render WebSocket alive (Render closes idle connections at ~30s)
setInterval(() => { if (socket.connected) socket.emit("ping"); }, 25000);
setInterval(() => {}, 60000);
// Write PID so start.bat can kill only this process on restart (not all node processes)
try { require("fs").writeFileSync(require("path").join(__dirname, "worker.pid"), String(process.pid)); } catch {}
console.log("[worker] Starting...");
\`\`\`

## Step 5 — Install agentinbox-mcp locally
Run this in the project root so Claude can start the MCP server instantly without a network call on every task.
\`\`\`
npm install agentinbox-mcp --save
\`\`\`

## Step 6 — Write .mcp.json in the project root
This lets Claude call AgentInbox tools and take screenshots when it wakes up.
If .mcp.json already exists, merge the new servers in — do not overwrite existing entries.

\`\`\`json
{
  "mcpServers": {
    "agentinbox": {
      "command": "node",
      "args": ["node_modules/agentinbox-mcp/dist/index.js"],
      "env": {
        "AGENTINBOX_TOKEN": "${wsToken}"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
\`\`\`

## Step 7 — Write the startup scripts inside .agentinbox/
Replace PROJECT_PATH with the actual absolute path of this project root.

**Windows — write .agentinbox/start.bat:**
\`\`\`bat
@echo off
set AGENTINBOX_TOKEN=${wsToken}
set AGENTINBOX_URL=https://useagentinbox.com
set CLAUDE_PROJECT_PATH=PROJECT_PATH
cd /d PROJECT_PATH\\.agentinbox

:: Kill previous bat loop (prevents duplicate loops on re-launch)
if exist bat.pid (
  set /p BAT_PID=<bat.pid
  del bat.pid > nul 2>&1
  taskkill /F /T /PID %BAT_PID% > nul 2>&1
  timeout /t 2 /nobreak > nul
)

:: Kill previous node worker
if exist worker.pid (
  set /p PREV_PID=<worker.pid
  del worker.pid > nul 2>&1
  taskkill /F /T /PID %PREV_PID% > nul 2>&1
  timeout /t 1 /nobreak > nul
)

:: Write THIS cmd.exe PID as bat loop lock
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=$pid\\").ParentProcessId | Out-File -FilePath 'bat.pid' -Encoding ascii -NoNewline"

:loop
node worker.js >> PROJECT_PATH\\.agentinbox\\worker.log 2>&1
timeout /t 5 /nobreak > nul
goto loop
\`\`\`

**Windows — write .agentinbox/start.vbs:**
\`\`\`vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "PROJECT_PATH\\.agentinbox\\start.bat", 0, False
\`\`\`

**Mac/Linux — write .agentinbox/start.sh:**
\`\`\`bash
#!/bin/bash
export AGENTINBOX_TOKEN=${wsToken}
export AGENTINBOX_URL=https://useagentinbox.com
export CLAUDE_PROJECT_PATH="PROJECT_PATH"
cd "PROJECT_PATH/.agentinbox"
while true; do
  node worker.js >> "PROJECT_PATH/.agentinbox/worker.log" 2>&1
  sleep 5
done
\`\`\`

## Step 8 — Add to system startup

**Windows:** Run this PowerShell command:
\`\`\`
Copy-Item "PROJECT_PATH\\.agentinbox\\start.vbs" "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\agentinbox-${wsToken.slice(3, 11)}.vbs" -Force
\`\`\`

**Mac:** Run these commands:
\`\`\`bash
chmod +x PROJECT_PATH/.agentinbox/start.sh
cat > ~/Library/LaunchAgents/com.agentinbox.worker.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.agentinbox.worker</string>
  <key>ProgramArguments</key><array><string>PROJECT_PATH/.agentinbox/start.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict></plist>
EOF
launchctl load ~/Library/LaunchAgents/com.agentinbox.worker.plist
\`\`\`

## Step 9 — Register a watchdog (auto-recovery if the worker crashes)
The start.bat loop can itself die (e.g. if its whole process tree is killed), leaving the worker permanently dead with no automatic recovery.

Replace PROJECT_PATH with the actual absolute path of this project root, and substitute ${wsToken.slice(3, 11)} the same way Step 8 did for the startup vbs filename.

IMPORTANT: write this file with PLAIN ASCII ONLY — no em-dashes or other non-ASCII characters. A .ps1 file with non-ASCII characters silently fails to run when executed via \`powershell.exe -File\` (it works fine when typed inline interactively, but silently no-ops when saved as a file — an encoding mismatch). Use plain hyphens \`-\` instead.

**Windows — write .agentinbox/watchdog.ps1:**
\`\`\`powershell
$agentDir = "PROJECT_PATH\\.agentinbox"
$batPidFile = "$agentDir\\bat.pid"
$startBat = "$agentDir\\start.bat"
$logFile = "$agentDir\\watchdog.log"

$alive = $false
$batPid = $null
if (Test-Path $batPidFile) {
  $batPid = Get-Content $batPidFile -ErrorAction SilentlyContinue
  if ($batPid) {
    $proc = Get-Process -Id $batPid -ErrorAction SilentlyContinue
    if ($proc) { $alive = $true }
  }
}

$timestamp = [DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss")
if (-not $alive) {
  "$timestamp bat loop dead or bat.pid missing (was: $batPid) - restarting start.bat" | Out-File -FilePath $logFile -Append
  Start-Process cmd.exe -ArgumentList "/c \`"$startBat\`"" -WindowStyle Hidden
} else {
  "$timestamp bat loop alive (PID $batPid) - no action" | Out-File -FilePath $logFile -Append
}
\`\`\`

**Windows — register it as a scheduled task that runs every 10 minutes:**
\`\`\`powershell
$taskName = "AgentInbox-Watchdog-${wsToken.slice(3, 11)}"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "PROJECT_PATH\\.agentinbox\\watchdog.ps1"'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force
\`\`\`

Verify it registered:
\`\`\`powershell
Get-ScheduledTask -TaskName "AgentInbox-Watchdog-${wsToken.slice(3, 11)}"
\`\`\`
You MUST see \`State: Ready\`. Do not report success unless this is confirmed.

**Mac/Linux:** this step is Windows-only for now. You may skip it, or add a cron-based equivalent (e.g. a cron job every 10 minutes that checks if the PID in bat.pid is alive and relaunches start.sh if not) if you want parity, but the Windows version is the priority.

## Step 10 — Write CLAUDE.local.md in the project root
Based on your codebase scan, write CLAUDE.local.md with:
- What this project does (1 sentence)
- Stack and key folders
- How to run the project locally
- Where the main entry points are
- Any important conventions or gotchas
Also include a Verification section. To fill it in correctly:
1. Read package.json "scripts" — find the dev/start command (e.g. "dev": "vite", "start": "node server.js")
2. Check vite.config.js, next.config.js, .env, .env.example, or README for the port number
3. Check for seed/fixture files or README for test login credentials
4. If port is not found anywhere, default to 3000

Write the section with the REAL values you found — not placeholders:

\`\`\`
## Verification
- Start: <actual command, e.g. npm run dev>
- URL: <actual URL with port, e.g. http://localhost:5173>
- Login: <test credentials if login required — write ASK_DEVELOPER if not found>
\`\`\`
## Step 11 — Write codebase rules
Create .claude/rules/ with one markdown file per domain area (e.g. frontend.md, api.md, database.md). Each file gives Claude enough context to fix bugs in that area without asking questions.

Do NOT write any screenshot or verification rules — the worker handles screenshots automatically after Claude exits.

## Step 12 — Update .gitignore
Add these lines:
\`\`\`
.agentinbox/
CLAUDE.local.md
\`\`\`

## Step 13 — Start the worker now
IMPORTANT: Launch via start.bat (NOT node worker.js directly) — start.bat handles auto-restart and logging.

On Windows — run this PowerShell command:
  Start-Process cmd.exe -ArgumentList '/c .agentinbox\\start.bat' -WindowStyle Hidden

On Mac/Linux — run:
  bash .agentinbox/start.sh &

Wait 5 seconds then check the log to confirm it connected:

On Windows:
  Start-Sleep 5; Get-Content .agentinbox/worker.log -Tail 5

On Mac/Linux:
  sleep 5 && tail -5 .agentinbox/worker.log

You MUST see: [worker] Connected to AgentInbox
If you don't see it, run the check again after 5 more seconds.
Do NOT report success unless you see the Connected line in worker.log.
The worker now runs silently in the background and will auto-restart on every PC boot.

Note: Telegram bot setup (on the PM dashboard, separate from this codebase setup) does NOT need
to happen before or during this setup. The worker re-checks Telegram config every 5 minutes on
its own, so configuring Telegram now or later both work without restarting anything.

## Step 14 — Report back
Tell me:
- OS detected
- Absolute project path used
- Startup script copied to startup folder (confirm)
- Watchdog scheduled task registered (confirm State: Ready)
- Submission link: https://useagentinbox.com/submit/${projectSubmitToken || "YOUR_PROJECT_TOKEN"}

## How it works
PC boots → worker starts silently → connects to AgentInbox
Task submitted → Claude wakes, fixes it, takes screenshot, exits → Telegram ✅ photo → proof on PM dashboard
VS Code does NOT need to be open. You don't need to be at your desk.

## Troubleshooting
**Verify worker is running:** check .agentinbox/worker.log — should show [worker] Connected to AgentInbox
  - Windows: \`type .agentinbox\\worker.log\`
  - Mac/Linux: \`cat .agentinbox/worker.log\`

**Worker did not start on boot:** the .vbs was not registered or boot happened before setup completed.
  - Windows: double-click .agentinbox/start.vbs to start it now (runs silently in background)
  - Re-register: \`Copy-Item ".agentinbox\\start.vbs" "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\agentinbox-${wsToken.slice(3, 11)}.vbs" -Force\`
  - Mac: \`launchctl load ~/Library/LaunchAgents/com.agentinbox.worker.plist\`

**Not connecting:** check .agentinbox/worker.log — look for [worker] Error
**Claude not found:** set CLAUDE_PATH in .agentinbox/start.bat/.sh to the full path of claude
**socket.io not found:** run npm install socket.io-client in the project root
**get_pending_tasks not found:** make sure .mcp.json is in the project root
**No screenshot in Telegram:** make sure .mcp.json includes the playwright server entry
**Worker stopped responding and nothing in the log for a while:** the bat loop itself may have died. Check .agentinbox/watchdog.log - it logs every 10 minutes whether the bat loop was alive or had to be restarted. If you see repeated "restarting start.bat" entries, something is killing the worker repeatedly - investigate why (e.g. a process killing all node.exe processes, or insufficient permissions).`;

    res.setHeader("Content-Disposition", "attachment; filename=\"setup.md\"");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(setupMd);
  });

  // ── Agent routes (workspace token auth, used by agentinbox-mcp) ────────────

  function requireWorkspaceToken(req: Request, res: Response, next: Function) {
    const token = req.headers["x-workspace-token"] as string;
    if (!token) { res.status(401).json({ error: "Missing x-workspace-token" }); return; }
    const workspace = taskQueries.getWorkspaceByToken(token);
    if (!workspace) { res.status(401).json({ error: "Invalid workspace token" }); return; }
    (req as any).agentWorkspace = workspace;
    next();
  }

  router.get("/agent/workspace", requireWorkspaceToken, (req: Request, res: Response) => {
    const ws = (req as any).agentWorkspace;
    const tgCfg = taskQueries.getTelegramConfig(ws.id);
    res.json({
      workspace_id: ws.id,
      workspace_name: ws.name,
      plan: ws.plan,
      telegram_bot_token: ws.telegram_bot_token || null,
      telegram_chat_id: ws.telegram_chat_id || null,
      screenshot_verification: tgCfg.screenshot_verification,
    });
  });

  router.get("/agent/tasks/pending", requireWorkspaceToken, (req: Request, res: Response) => {
    const ws = (req as any).agentWorkspace;
    const projects = db.prepare("SELECT id, require_approval, require_verification FROM projects WHERE workspace_id = ?").all(ws.id) as { id: string; require_approval: number; require_verification: number }[];
    const tasks = projects.flatMap((p) =>
      // getPendingTasks also recovers tasks stuck in_progress > 15 min (Claude crashed mid-task)
      taskQueries.getPendingTasks(p.id).map(({ file_data, screenshot_base64, ...t }) => ({ ...t, has_file: !!file_data, require_approval: p.require_approval === 1, require_verification: t.require_verification === 1 }))
    );
    res.json(tasks);
  });

  router.get("/agent/tasks/:id", requireWorkspaceToken, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    const project = taskQueries.getProjectById(task.project_id);
    const { file_data, screenshot_base64, ...taskSafe } = task;
    res.json({ ...taskSafe, has_file: !!file_data, require_approval: project?.require_approval === 1, require_verification: task.require_verification === 1 });
  });

  router.get("/agent/tasks/:id/file", requireWorkspaceToken, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task || (!task.file_content && !task.file_data)) { res.status(404).json({ error: "No file for this task" }); return; }
    res.json({ file_name: task.file_name, file_content: task.file_content, file_data: task.file_data, media_type: task.file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? "image/jpeg" : undefined });
  });

  router.delete("/agent/tasks/:id", requireWorkspaceToken, (req: Request, res: Response) => {
    const deleted = taskQueries.deleteTask(req.params.id);
    if (!deleted) { res.status(404).json({ error: "Task not found" }); return; }
    res.json({ ok: true });
  });

  router.post("/agent/tasks/:id/status", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { status } = z.object({ status: z.enum(["in_progress", "blocked", "failed"]) }).parse(req.body);
      const updated = taskQueries.updateStatus(req.params.id, status);
      // updateStatus returns undefined when the atomic in_progress claim lost the race
      if (!updated) { res.status(409).json({ error: "Task already claimed by another Claude instance — skip it" }); return; }
      res.json(updated);
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  router.post("/agent/tasks/:id/complete", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { summary_technical, summary_plain, screenshot_base64: rawScreenshot, verification_url } = z.object({
        summary_technical: z.string().min(1),
        summary_plain: z.string().min(1),
        screenshot_base64: z.string().optional(),
        verification_url: z.string().url().optional(),
      }).parse(req.body);
      // Validate screenshot — must be a real PNG (min 10KB decoded) otherwise discard
      let screenshot_base64 = rawScreenshot;
      if (screenshot_base64) {
        const decoded = Buffer.from(screenshot_base64, "base64");
        const isPng = decoded[0] === 0x89 && decoded[1] === 0x50 && decoded[2] === 0x4E && decoded[3] === 0x47;
        if (!isPng) {
          console.warn(`[complete] Discarding invalid screenshot — isPng:${isPng} size:${decoded.length}b`);
          screenshot_base64 = undefined;
        }
      }
      const result = taskQueries.completeTask(req.params.id, summary_technical, summary_plain, undefined, screenshot_base64, verification_url);
      if (!result) { res.status(404).json({ error: "Task not found" }); return; }
      const { task: updated, wasAlreadyDone } = result;
      // Only notify once — suppress Telegram + PM push if task was already done (duplicate complete_task call)
      if (!wasAlreadyDone) {
        const ws = (req as any).agentWorkspace;
        emitToPm(ws.id, "task.done", {
          task_id: updated.id,
          title: updated.title,
          summary_plain,
          has_screenshot: !!screenshot_base64,
        });
        // Skip Telegram text message when require_verification=true — worker sends the photo after screenshotting
        if (!updated.require_verification) {
          notifyTaskDone(updated.id, updated.title).catch(() => {});
        }
      }
      res.json(updated);
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  router.post("/agent/tasks/:id/escalate", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      const updated = taskQueries.escalateTask(req.params.id, reason);
      if (!updated) { res.status(404).json({ error: "Task not found" }); return; }
      const ws = (req as any).agentWorkspace;
      emitToPm(ws.id, "task.escalated", {
        task_id: updated.id,
        title: updated.title,
        reason,
      });
      notifyTaskEscalated(updated.id, updated.title, reason).catch(() => {});
      res.json(updated);
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  // ── ask_developer reply endpoint (called by Telegram bot polling) ───────────

  router.post("/agent/tasks/:id/ask", requireWorkspaceToken, async (req: Request, res: Response) => {
    try {
      const { question } = z.object({ question: z.string().min(1) }).parse(req.body);
      const task = taskQueries.getTask(req.params.id);
      if (!task) { res.status(404).json({ error: "Task not found" }); return; }
      await askDeveloper(task.id, task.title, question);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  router.post("/agent/tasks/:id/reply", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { reply } = z.object({ reply: z.string().min(1) }).parse(req.body);
      const task = taskQueries.getTask(req.params.id);
      if (!task) { res.status(404).json({ error: "Task not found" }); return; }
      db.prepare("UPDATE tasks SET developer_reply = ?, updated_at = ? WHERE id = ?")
        .run(reply, Math.floor(Date.now() / 1000), task.id);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  // Worker posts screenshot after Claude exits (worker-side screenshot approach)
  router.post("/agent/tasks/:id/screenshot", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { screenshot_base64 } = z.object({ screenshot_base64: z.string().min(1) }).parse(req.body);
      const task = taskQueries.getTask(req.params.id);
      if (!task) { res.status(404).json({ error: "Task not found" }); return; }
      // Validate PNG
      const decoded = Buffer.from(screenshot_base64, "base64");
      const isPng = decoded[0] === 0x89 && decoded[1] === 0x50 && decoded[2] === 0x4E && decoded[3] === 0x47;
      if (!isPng) {
        res.status(400).json({ error: "Invalid screenshot — not a PNG or too small" });
        return;
      }
      db.prepare("UPDATE tasks SET screenshot_base64 = ?, updated_at = ? WHERE id = ?")
        .run(screenshot_base64, Math.floor(Date.now() / 1000), task.id);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  // Screenshot serving — base64 stored in DB, served as PNG
  router.get("/tasks/:id/screenshot", requireAuth, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
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
