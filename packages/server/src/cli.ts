#!/usr/bin/env node
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env — try cwd (monorepo root when run via pnpm dev), then package root
const cwdEnv = path.resolve(process.cwd(), ".env");
const pkgEnv = path.resolve(__dirname, "../.env");
const envPath = fs.existsSync(cwdEnv) ? cwdEnv : pkgEnv;
dotenv.config({ path: envPath });
console.log(`  Loading .env from: ${envPath} (WEBHOOK_URL=${process.env.WEBHOOK_URL || "not set"})`);
import { createApp } from "./index";

const args = process.argv.slice(2);
const command = args[0] || "start";

if (command === "start") {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const app = createApp();

  app.listen(PORT, () => {
    const line = "─".repeat(45);
    console.log(`\n  ┌${line}┐`);
    console.log(`  │${"   AgentInbox is running".padEnd(45)}│`);
    console.log(`  └${line}┘\n`);
    console.log(`  Server:    http://localhost:${PORT}`);
    console.log(`  Submit UI: http://localhost:${PORT}/submit/<token>`);
    console.log(`  PM dash:   http://localhost:${PORT}/pm\n`);
    console.log(`  Claude MCP config:`);
    console.log(`  ┌${line}┐`);
    console.log(`  │ {                                             │`);
    console.log(`  │   "mcpServers": {                            │`);
    console.log(`  │     "agentinbox": {                          │`);
    console.log(`  │       "url": "http://localhost:${PORT}/mcp"    │`);
    console.log(`  │     }                                        │`);
    console.log(`  │   }                                          │`);
    console.log(`  │ }                                            │`);
    console.log(`  └${line}┘\n`);

    if (!process.env.API_KEY) {
      console.log(`  ⚠  No API_KEY set — PM dashboard is open to anyone.`);
      console.log(`     Set API_KEY=your-secret in .env to secure it.\n`);
    }
  });
} else {
  console.error(`Unknown command: ${command}`);
  console.error(`Usage: agentinbox start`);
  process.exit(1);
}
