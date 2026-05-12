#!/usr/bin/env node
/**
 * AgentInbox Claude Router
 *
 * Single webhook listener that routes tasks to the right project directory.
 * Supports multiple projects — one process instead of one per project.
 *
 * Usage:
 *   node claude-router.js --config projects.json --port 4001
 *
 * projects.json format:
 * [
 *   { "token": "abc123", "dir": "D:\\my-project", "name": "My Project" },
 *   { "token": "xyz789", "dir": "D:\\other-project", "name": "Other Project" }
 * ]
 *
 * Set in AgentInbox .env:
 *   WEBHOOK_URL=http://localhost:4001/webhook
 */

const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const CONFIG_FILE = getArg("--config");
const PORT        = parseInt(getArg("--port") || "4001", 10);
const SECRET      = getArg("--secret") || process.env.WEBHOOK_SECRET || "";

if (!CONFIG_FILE) {
  console.error("Usage: node claude-router.js --config projects.json [--port 4001] [--secret <secret>]");
  console.error("\nprojects.json example:");
  console.error(JSON.stringify([
    { token: "YOUR_TOKEN_1", dir: "D:\\project-one", name: "Project One" },
    { token: "YOUR_TOKEN_2", dir: "D:\\project-two", name: "Project Two" },
  ], null, 2));
  process.exit(1);
}

// ── Load config ───────────────────────────────────────────────────────────────
let projects;
try {
  projects = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
} catch (e) {
  console.error(`Failed to read config file: ${CONFIG_FILE}\n${e.message}`);
  process.exit(1);
}

// Map token → project config
const projectMap = {};
for (const p of projects) {
  if (!p.token || !p.dir) {
    console.error("Each project entry needs 'token' and 'dir'");
    process.exit(1);
  }
  projectMap[p.token] = p;
}

// ── Per-project state: prevent overlapping Claude runs ────────────────────────
const state = {}; // token → { running: bool, queue: [] }
for (const token of Object.keys(projectMap)) {
  state[token] = { running: false, queue: [] };
}

function runClaude(token) {
  const project = projectMap[token];
  const s = state[token];

  if (s.running) {
    console.log(`[${project.name}] Claude already running — task queued`);
    return;
  }

  s.running = true;
  console.log(`\n[${project.name}] Triggering Claude in ${project.dir}`);

  const agentInboxMd = path.join(project.dir, "scripts", "agentinbox.md");
  const defaultPrompt = [
    "You are an autonomous agent. Do not chat. Execute these steps immediately:",
    "1. Call mcp__agentinbox__get_pending_tasks to list all pending tasks.",
    "2. For each task: call mcp__agentinbox__update_task_status (in_progress), then mcp__agentinbox__get_task to read the FULL description, then mcp__agentinbox__get_file if has_file is true.",
    "3. Fix the bug or feature in the codebase based on the description.",
    "4. Call mcp__agentinbox__complete_task with summary_technical and summary_plain.",
    "5. If stuck, call mcp__agentinbox__escalate_task.",
    "Process ALL pending tasks. Start now.",
  ].join(" ");

  const promptText = fs.existsSync(agentInboxMd)
    ? fs.readFileSync(agentInboxMd, "utf-8")
    : defaultPrompt;

  const tmpFile = path.join(require("os").tmpdir(), `agentinbox-${token.slice(0, 8)}-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, promptText, "utf-8");

  const child = spawn(
    "powershell",
    ["-NoProfile", "-Command", `Get-Content -Raw "${tmpFile}" | claude --dangerously-skip-permissions --print`],
    { cwd: project.dir, stdio: "inherit", shell: false, env: { ...process.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: "100000" } }
  );

  child.on("close", (code) => {
    try { fs.unlinkSync(tmpFile); } catch {}
    s.running = false;
    console.log(`[${project.name}] Claude finished (exit ${code})`);

    if (s.queue.length > 0) {
      s.queue.length = 0;
      console.log(`[${project.name}] More tasks queued — re-triggering Claude`);
      setTimeout(() => runClaude(token), 2000);
    }
  });
}

// ── Webhook server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // ── CORS headers (allow Magic Builder frontend to POST directly) ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-AgentInbox-Secret");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── /status/:slug — poll for generation completion (GET) ─────────────────
  const statusMatch = req.url.match(/^\/status\/([^/?]+)$/);
  if (statusMatch && req.method === "GET") {
    const slug = statusMatch[1];
    const project = Object.values(projectMap).find(p => p.name === "NewWeb Magic Builder");
    if (!project) { res.writeHead(500); res.end(JSON.stringify({ error: "Not configured" })); return; }

    const payloadPath = path.join(project.dir, "scripts", "agentinbox-payload.json");
    const resultPath  = path.join(project.dir, "scripts", "agentinbox-result.md");

    const payloadGone = !fs.existsSync(payloadPath);
    const resultExists = fs.existsSync(resultPath);

    if (payloadGone && resultExists) {
      res.writeHead(200); res.end(JSON.stringify({ status: "done", slug })); return;
    }
    res.writeHead(200); res.end(JSON.stringify({ status: "pending", slug })); return;
  }

  if (req.method !== "POST") {
    res.writeHead(404); res.end("Not found"); return;
  }

  // ── /generate — Magic Builder direct trigger ──────────────────────────────
  // Accepts the full wizard payload, writes it to scripts/agentinbox-payload.json
  // inside the NewWeb project directory, then triggers Claude to generate the site.
  if (req.url === "/generate") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.slug || !payload.prompt) {
          res.writeHead(400); res.end(JSON.stringify({ error: "Missing slug or prompt" })); return;
        }

        // Find NewWeb project entry
        const project = Object.values(projectMap).find(p => p.name === "NewWeb Magic Builder");
        if (!project) {
          res.writeHead(500); res.end(JSON.stringify({ error: "NewWeb Magic Builder not configured in projects.json" })); return;
        }

        // Write payload and clear any previous result so status polling starts fresh
        const payloadPath = path.join(project.dir, "scripts", "agentinbox-payload.json");
        const resultPath  = path.join(project.dir, "scripts", "agentinbox-result.md");
        fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf-8");
        try { fs.unlinkSync(resultPath); } catch {}

        console.log(`[NewWeb Magic Builder] Generation request: "${payload.brandName || payload.slug}" (${payload.businessType || "unknown type"})`);
        res.writeHead(202); res.end(JSON.stringify({ status: "queued", slug: payload.slug }));

        // Trigger Claude — uses scripts/agentinbox.md as prompt
        const token = project.token;
        const s = state[token];
        if (s.running) {
          s.queue.push(payload.slug);
          console.log(`[NewWeb Magic Builder] Claude busy — "${payload.slug}" queued`);
        } else {
          runClaude(token);
        }
      } catch (e) {
        console.error("[/generate] Error:", e.message);
        res.writeHead(400); res.end(JSON.stringify({ error: "Bad request" }));
      }
    });
    return;
  }

  // ── /webhook — standard AgentInbox task webhook ───────────────────────────
  if (req.url !== "/webhook") {
    res.writeHead(404); res.end("Not found"); return;
  }

  if (SECRET && req.headers["x-agentinbox-secret"] !== SECRET) {
    res.writeHead(401); res.end("Unauthorized"); return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);

      if (payload.event !== "task.created") {
        res.writeHead(200); res.end("ignored"); return;
      }

      const token = payload.project_token;
      const project = projectMap[token];

      if (!project) {
        console.log(`[router] No project configured for token ${token} — ignoring`);
        res.writeHead(200); res.end("ignored"); return;
      }

      console.log(`[${project.name}] New task: "${payload.title}" (${payload.task_id})`);
      res.writeHead(200); res.end("ok");

      const s = state[token];
      if (s.running) {
        s.queue.push(payload.task_id);
      } else {
        runClaude(token);
      }
    } catch {
      res.writeHead(400); res.end("Bad request");
    }
  });
});

server.listen(PORT, () => {
  const lines = [
    "╔══════════════════════════════════════════════════════════════╗",
    "║              AgentInbox Claude Router                        ║",
    "╠══════════════════════════════════════════════════════════════╣",
    `║  Webhook:  http://localhost:${PORT}/webhook${" ".repeat(Math.max(0, 32 - PORT.toString().length))}║`,
    `║  Projects: ${projects.length.toString().padEnd(50)}║`,
    "╠══════════════════════════════════════════════════════════════╣",
    ...projects.map(p => `║  • ${p.name.padEnd(20)} ${p.dir.padEnd(35).slice(0,35)}║`),
    "╚══════════════════════════════════════════════════════════════╝",
  ];
  console.log("\n" + lines.join("\n") + "\n\nWaiting for tasks... (Ctrl+C to stop)\n");
});

process.on("SIGINT", () => {
  console.log("\n[router] Shutting down...");
  server.close(() => process.exit(0));
});
