import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import http from "http";
import { createRouter } from "./api/routes";
import { handleMcpRequest } from "./mcp/server";
import { createSlackApp } from "./slack/bot";
import { seedFromEnv } from "./queue/db";
import { initSocketServer } from "./socket/manager";

import fs from "fs";
const UI_DIST = fs.existsSync(path.join(__dirname, "../ui-dist"))
  ? path.join(__dirname, "../ui-dist")
  : path.join(__dirname, "../../ui/dist");

seedFromEnv();

export function createApp(): { app: Express; server: http.Server } {
  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // MCP endpoint — Claude connects here
  app.post("/mcp", handleMcpRequest);
  app.get("/mcp", handleMcpRequest);
  app.delete("/mcp", handleMcpRequest);

  // REST API
  app.use("/api", createRouter());

  // Slack
  const slackApp = createSlackApp();
  if (slackApp) {
    app.post("/slack/events", async (req, res) => {
      await (slackApp as any).processEvent(req, res);
    });
  }

  // WebSocket server for agentinbox-mcp clients
  initSocketServer(server);

  // Serve UI static files
  app.use(express.static(UI_DIST));
  app.get("*", (_req, res) => {
    const indexPath = path.join(UI_DIST, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(404).send("UI not built yet. Run: pnpm build");
    });
  });

  return { app, server };
}
