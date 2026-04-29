import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { createRouter } from "./api/routes";
import { handleMcpRequest } from "./mcp/server";
import { createSlackApp } from "./slack/bot";

import fs from "fs";
// npm package: ui-dist/ sits alongside dist/ inside the package root
// monorepo dev: fall back to packages/ui/dist (Vite output)
const UI_DIST = fs.existsSync(path.join(__dirname, "../ui-dist"))
  ? path.join(__dirname, "../ui-dist")
  : path.join(__dirname, "../../ui/dist");

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // MCP endpoint — Claude connects here
  app.post("/mcp", handleMcpRequest);
  app.get("/mcp", handleMcpRequest);
  app.delete("/mcp", handleMcpRequest);

  // REST API
  app.use("/api", createRouter());

  // Slack — mount Bolt middleware if configured
  const slackApp = createSlackApp();
  if (slackApp) {
    // Use Bolt's built-in Express receiver for /slack/events
    app.post("/slack/events", async (req, res) => {
      // Bolt handles verification and event routing
      await (slackApp as any).processEvent(req, res);
    });
  }

  // Serve UI static files in production
  app.use(express.static(UI_DIST));
  app.get("*", (_req, res) => {
    const indexPath = path.join(UI_DIST, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(404).send("UI not built yet. Run: pnpm build");
    });
  });

  return app;
}
