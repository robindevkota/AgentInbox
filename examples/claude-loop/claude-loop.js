#!/usr/bin/env node
/**
 * AgentInbox Claude Loop
 *
 * Runs a tiny HTTP server that receives webhook pings from AgentInbox
 * and triggers `claude` in your project directory to process the task.
 *
 * Usage:
 *   node claude-loop.js --project-dir D:\form-gen-mbl --project-token YOUR_TOKEN --port 4000
 *
 * Then set in AgentInbox .env:
 *   WEBHOOK_URL=http://localhost:4000/webhook
 *   WEBHOOK_SECRET=your-secret   (optional but recommended)
 */

const http = require("http");
const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const PROJECT_DIR   = getArg("--project-dir");
const PROJECT_TOKEN = getArg("--project-token"); // optional filter — only process tasks for this token
const PORT          = parseInt(getArg("--port") || "4000", 10);
const SECRET        = getArg("--secret") || process.env.WEBHOOK_SECRET || "";

if (!PROJECT_DIR) {
  console.error("Usage: node claude-loop.js --project-dir <path> [--project-token <token>] [--port 4000] [--secret <secret>]");
  process.exit(1);
}

// ── State: prevent overlapping runs ──────────────────────────────────────────
let claudeRunning = false;
const pendingTriggers = [];

function runClaude() {
  if (claudeRunning) {
    console.log("[claude-loop] Claude already running — task queued");
    return;
  }

  claudeRunning = true;
  console.log(`\n[claude-loop] Triggering Claude in ${PROJECT_DIR}`);

  // Use scripts/agentinbox.md if it exists in the project — keeps AgentInbox
  // instructions separate from any other Claude agent setup in the project.
  const agentInboxMd = path.join(PROJECT_DIR, "scripts", "agentinbox.md");
  let claudeArgs;
  if (fs.existsSync(agentInboxMd)) {
    const promptText = fs.readFileSync(agentInboxMd, "utf-8");
    claudeArgs = ["--dangerously-skip-permissions", "-p", promptText];
  } else {
    const prompt = [
      "Check AgentInbox for pending tasks using get_pending_tasks().",
      PROJECT_TOKEN ? `Focus on project token: ${PROJECT_TOKEN}.` : "",
      "For each pending task:",
      "1. Call update_task_status(id, 'in_progress')",
      "2. Read the task title, description, and any attached file via get_file()",
      "3. Find the relevant code and fix the bug or implement the feature",
      "4. Call complete_task(id, summary_technical, summary_plain) when done",
      "Work through all pending tasks before stopping.",
    ].filter(Boolean).join(" ");
    claudeArgs = ["--dangerously-skip-permissions", "-p", prompt];
  }

  const child = spawn(
    "claude",
    claudeArgs,
    {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      shell: true,
    }
  );

  child.on("close", (code) => {
    claudeRunning = false;
    console.log(`[claude-loop] Claude finished (exit ${code})`);

    // If more tasks arrived while Claude was running, trigger again
    if (pendingTriggers.length > 0) {
      pendingTriggers.length = 0;
      console.log("[claude-loop] More tasks queued — re-triggering Claude");
      setTimeout(runClaude, 2000);
    }
  });
}

// ── Webhook server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // Verify secret if configured
  if (SECRET && req.headers["x-agentinbox-secret"] !== SECRET) {
    res.writeHead(401);
    res.end("Unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);

      if (payload.event !== "task.created") {
        res.writeHead(200);
        res.end("ignored");
        return;
      }

      // Filter by project token if specified
      if (PROJECT_TOKEN && payload.project_token !== PROJECT_TOKEN) {
        console.log(`[claude-loop] Ignoring task for project ${payload.project_token} (not our project)`);
        res.writeHead(200);
        res.end("ignored");
        return;
      }

      console.log(`[claude-loop] New task received: "${payload.title}" (${payload.task_id})`);
      res.writeHead(200);
      res.end("ok");

      if (claudeRunning) {
        pendingTriggers.push(payload.task_id);
      } else {
        runClaude();
      }
    } catch {
      res.writeHead(400);
      res.end("Bad request");
    }
  });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║            AgentInbox Claude Loop                     ║
╠═══════════════════════════════════════════════════════╣
║  Webhook listening on  http://localhost:${PORT}/webhook  ║
║  Project directory:    ${PROJECT_DIR.padEnd(30)} ║
║  Project token filter: ${(PROJECT_TOKEN || "all projects").padEnd(30)} ║
╚═══════════════════════════════════════════════════════╝

Waiting for tasks... (Ctrl+C to stop)
`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", () => {
  console.log("\n[claude-loop] Shutting down...");
  server.close(() => process.exit(0));
});
