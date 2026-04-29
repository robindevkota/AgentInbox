import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { taskQueries } from "../queue/tasks";
import { requireProjectToken, requireApiKey } from "../auth/tokens";
import { parseFile } from "../files/parser";

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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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

export function createRouter(): Router {
  const router = Router();

  // ── Public submission routes (token-gated) ──────────────────────────────

  // GET project info by token (for submission form to show project name)
  router.get("/submit/:token", requireProjectToken, (req: Request, res: Response) => {
    const project = (req as any).project;
    res.json({ id: project.id, name: project.name, description: project.description });
  });

  // POST submit a task (with optional file)
  router.post(
    "/submit/:token",
    requireProjectToken,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const project = (req as any).project;
        const body = z
          .object({
            title: z.string().min(1).max(200),
            description: z.string().min(1).max(5000),
            submitter_name: z.string().max(100).optional(),
            submitter_email: z.string().email().optional(),
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
        });

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

  // GET task status (for the live status page — no auth needed if you have the task id)
  router.get("/tasks/:id/status", (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({
      id: task.id,
      status: task.status,
      title: task.title,
      summary_plain: task.summary_plain,
      escalation_reason: task.status === "escalated" ? "This task needs human review." : null,
      updated_at: task.updated_at,
    });
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

  // Project management
  router.post("/workspaces/:workspaceId/projects", requireApiKey, (req: Request, res: Response) => {
    try {
      const { name, description } = z
        .object({ name: z.string().min(1), description: z.string().optional() })
        .parse(req.body);
      const project = taskQueries.createProject(req.params.workspaceId, name, description);
      res.status(201).json(project);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  router.get("/workspaces/:workspaceId/projects", requireApiKey, (req: Request, res: Response) => {
    const projects = taskQueries.listProjects(req.params.workspaceId);
    res.json(projects);
  });

  // Full task list for PM dashboard
  router.get("/projects/:projectId/tasks", requireApiKey, (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const tasks = taskQueries.listTasks(req.params.projectId, status as any);
    res.json(tasks);
  });

  // Full task detail for PM
  router.get("/tasks/:id", requireApiKey, (req: Request, res: Response) => {
    const task = taskQueries.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  });

  // Server-sent events — live status stream for a task
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

  return router;
}
