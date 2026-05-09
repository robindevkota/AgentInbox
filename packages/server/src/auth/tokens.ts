import { taskQueries } from "../queue/tasks";
import { verifyToken } from "./users";
import type { Request, Response, NextFunction } from "express";

export function requireProjectToken(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token || req.query.token as string;
  if (!token) {
    res.status(401).json({ error: "Project token required" });
    return;
  }
  const project = taskQueries.getProjectByToken(token);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  (req as any).project = project;
  next();
}

// Simple API key auth for PM dashboard and MCP access
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  const configuredKey = process.env.API_KEY;

  // If no API_KEY set, allow all (self-hosted default)
  if (!configuredKey) {
    next();
    return;
  }

  if (key !== configuredKey) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  next();
}

// JWT-based auth for hosted SaaS PM routes
export function requireAuth(req: Request, res: Response, next: NextFunction) {
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
  (req as any).user = payload;
  next();
}
