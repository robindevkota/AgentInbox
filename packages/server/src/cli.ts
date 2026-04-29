#!/usr/bin/env node
import { createApp } from "./index";

const PORT = parseInt(process.env.PORT || "3000", 10);
const app = createApp();

app.listen(PORT, () => {
  console.log("");
  console.log("  ┌─────────────────────────────────────────┐");
  console.log("  │           AgentInbox is running          │");
  console.log("  └─────────────────────────────────────────┘");
  console.log("");
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log("");
  console.log("  Add to Claude MCP config:");
  console.log(`  { "agentinbox": { "url": "http://localhost:${PORT}/mcp" } }`);
  console.log("");
});
