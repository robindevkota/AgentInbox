import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { taskQueries } from "../queue/tasks";
import { requireProjectToken, requireApiKey } from "../auth/tokens";
import { parseFile } from "../files/parser";
import { sendOtp } from "../email/mailer";
import { fireWebhook } from "../webhook/notify";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
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

function baseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
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
            submitter_name: z.string().max(100).optional(),
            submitter_email: z.string().email().optional(),
            custom_field_values: z.record(z.string()).optional(),
          })
          .parse(req.body);

        let filePath: string | undefined;
        let fileName: string | undefined;
        let fileContent: string | undefined;

        if (req.file) {
          filePath = req.file.path;
          fileName = req.file.originalname;
          try {
            fileContent = await parseFile(req.file.path, req.file.mimetype);
          } catch {
            fileContent = `[Could not parse file: ${fileName}]`;
          }
        }

        const task = taskQueries.createTask({
          project_id: project.id,
          title: body.title,
          description: body.description,
          submitter_name: body.submitter_name,
          submitter_email: body.submitter_email,
          file_path: filePath,
          file_name: fileName,
          file_content: fileContent,
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

        // Fire webhook async — does not block the response
        fireWebhook({
          event: "task.created",
          task_id: task.id,
          project_id: project.id,
          project_name: project.name,
          project_token: project.token,
          title: task.title,
          description: task.description,
          submitter_name: task.submitter_name,
          has_file: !!task.file_path,
        }).catch(() => {});

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

  // ── PM / Admin routes (API key gated) ──────────────────────────────────

  // Workspace management
  router.post("/workspaces", requireApiKey, (req: Request, res: Response) => {
    try {
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      const workspace = taskQueries.createWorkspace(name);
      res.status(201).json(workspace);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // Usage dashboard stats
  router.get("/workspaces/:workspaceId/stats", requireApiKey, (req: Request, res: Response) => {
    const stats = taskQueries.getWorkspaceStats(req.params.workspaceId);
    res.json(stats);
  });

  // Project management
  router.post(
    "/workspaces/:workspaceId/projects",
    requireApiKey,
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
    requireApiKey,
    (req: Request, res: Response) => {
      const projects = taskQueries.listProjects(req.params.workspaceId);
      res.json(projects);
    }
  );

  router.delete("/projects/:id", requireApiKey, (req: Request, res: Response) => {
    const deleted = taskQueries.deleteProject(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.patch("/projects/:id", requireApiKey, (req: Request, res: Response) => {
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
    requireApiKey,
    (req: Request, res: Response) => {
      const status = req.query.status as string | undefined;
      const tasks = taskQueries.listTasks(req.params.projectId, status as any);
      res.json(tasks);
    }
  );

  // Full task detail + audit log
  router.get("/tasks/:id", requireApiKey, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const audit = taskQueries.getAuditLog(req.params.id);
    res.json({ ...task, audit });
  });

  // ── Approval gate ────────────────────────────────────────────────────────

  router.post("/tasks/:id/approve", requireApiKey, (req: Request, res: Response) => {
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

  router.post("/tasks/:id/reject", requireApiKey, (req: Request, res: Response) => {
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

  return router;
}
