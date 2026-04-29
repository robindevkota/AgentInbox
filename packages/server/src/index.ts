import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { createRouter } from "./api/routes";
import { handleMcpRequest } from "./mcp/server";

const UI_DIST = path.join(__dirname, "../../ui/dist");

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // MCP endpoint — Claude connects here
  app.post("/mcp", handleMcpRequest);
  app.get("/mcp", handleMcpRequest);
  app.delete("/mcp", handleMcpRequest);

  // REST API for the UI
  app.use("/api", createRouter());

  // Serve UI static files in production
  app.use(express.static(UI_DIST));
  app.get("*", (_req, res) => {
    const indexPath = path.join(UI_DIST, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(404).send("UI not built. Run: pnpm build");
    });
  });

  return app;
}
