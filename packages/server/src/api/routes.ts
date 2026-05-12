import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { taskQueries } from "../queue/tasks";
import { requireProjectToken, requireAuth } from "../auth/tokens";
import { signupUser, loginUser, getMe, verifyToken } from "../auth/users";
import { db } from "../queue/db";
import { parseFile } from "../files/parser";
import { sendOtp } from "../email/mailer";
import { fireWebhook } from "../webhook/notify";
import { emitTaskCreated } from "../socket/manager";

const FREE_TASK_LIMIT = 50;
const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";


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
        command: "npx",
        args: ["-y", "agentinbox-mcp"],
        env: { AGENTINBOX_TOKEN: token },
      },
    },
  };
}

export function createRouter(): Router {
  const router = Router();

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
            description: z.string().min(1).max(5000),
            priority: z.enum(["low", "medium", "high"]).optional(),
            submitter_name: z.string().max(100).optional(),
            submitter_email: z.string().email().optional(),
            custom_field_values: z.record(z.string()).optional(),
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
        };

        // Emit to connected agentinbox-mcp socket for this workspace
        const workspace = db
          .prepare("SELECT id FROM workspaces WHERE id = (SELECT workspace_id FROM projects WHERE id = ?)")
          .get(project.id) as { id: string } | undefined;
        if (workspace) emitTaskCreated(workspace.id, taskPayload);

        // Also fire webhook as fallback (ngrok/router still supported)
        fireWebhook(taskPayload).catch(() => {});

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
    res.json({ workspace_id: ws.id, workspace_name: ws.name, plan: ws.plan });
  });

  router.get("/agent/tasks/pending", requireWorkspaceToken, (req: Request, res: Response) => {
    const ws = (req as any).agentWorkspace;
    const projects = db.prepare("SELECT id FROM projects WHERE workspace_id = ?").all(ws.id) as { id: string }[];
    const tasks = projects.flatMap((p) => taskQueries.listTasks(p.id, "pending"));
    res.json(tasks);
  });

  router.get("/agent/tasks/:id", requireWorkspaceToken, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  });

  router.get("/agent/tasks/:id/file", requireWorkspaceToken, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task || !task.file_content) { res.status(404).json({ error: "No file for this task" }); return; }
    res.json({ file_name: task.file_name, file_content: task.file_content });
  });

  router.post("/agent/tasks/:id/status", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { status } = z.object({ status: z.enum(["in_progress", "blocked", "failed"]) }).parse(req.body);
      const updated = taskQueries.updateStatus(req.params.id, status);
      res.json(updated);
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  router.post("/agent/tasks/:id/complete", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { summary_technical, summary_plain, screenshot_base64 } = z.object({
        summary_technical: z.string().min(1),
        summary_plain: z.string().min(1),
        screenshot_base64: z.string().optional(),
      }).parse(req.body);
      const updated = taskQueries.completeTask(req.params.id, summary_technical, summary_plain, undefined, screenshot_base64);
      res.json(updated);
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  router.post("/agent/tasks/:id/escalate", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      const updated = taskQueries.escalateTask(req.params.id, reason);
      res.json(updated);
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  router.post("/agent/tasks/:id/propose", requireWorkspaceToken, (req: Request, res: Response) => {
    try {
      const { plan } = z.object({ plan: z.string().min(1) }).parse(req.body);
      const updated = taskQueries.proposePlan(req.params.id, plan);
      res.json(updated);
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
