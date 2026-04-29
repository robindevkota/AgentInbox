#!/usr/bin/env node
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const args = process.argv.slice(2);
const command = args[0] || "help";

// ── help ─────────────────────────────────────────────────────────────────────
if (command === "help" || command === "--help" || command === "-h") {
  console.log(`
  AgentInbox — AI-powered task inbox for dev teams

  Usage:
    agentinbox start              Start the AgentInbox server
    agentinbox router             Start the multi-project Claude router
    agentinbox init               Scaffold scripts/agentinbox.md in current project
    agentinbox mcp                Print the MCP config snippet for Claude

  Options for start:
    --port <n>                    Port to listen on (default: 3000)
    --data <dir>                  Directory for database and uploads

  Options for router:
    --config <file>               Path to projects.json (default: ./projects.json)
    --port <n>                    Webhook port (default: 4001)

  Examples:
    npx agentinbox start
    npx agentinbox router --config ./projects.json
    npx agentinbox init
`);
  process.exit(0);
}

// ── init ─────────────────────────────────────────────────────────────────────
if (command === "init") {
  const target = path.join(process.cwd(), "scripts", "agentinbox.md");
  if (fs.existsSync(target)) {
    console.log(`  scripts/agentinbox.md already exists — skipping.`);
    process.exit(0);
  }
  fs.mkdirSync(path.join(process.cwd(), "scripts"), { recursive: true });
  fs.writeFileSync(target, `You are an autonomous agent. Follow these steps exactly without asking questions.

STEP 1: Call mcp__agentinbox__get_pending_tasks to get all pending tasks.

STEP 2: For each task:
  a) Call mcp__agentinbox__update_task_status with status "in_progress"
  b) Call mcp__agentinbox__get_task to read the full description
  c) If has_file=true, call mcp__agentinbox__get_file to see the attachment
  d) Fix the issue in the codebase based on the description and custom_field_values
  e) Call mcp__agentinbox__complete_task with summary_technical and summary_plain

STEP 3: If you cannot solve a task, call mcp__agentinbox__escalate_task with a reason.

STEP 4: Process ALL pending tasks before stopping.

Project context:
- Stack: [TODO: describe your stack, e.g. React + TypeScript + Express]
- Key directories: [TODO: e.g. src/components/, src/api/]
- Notes: [TODO: any rules Claude should follow]

Start now by calling mcp__agentinbox__get_pending_tasks.
`);
  console.log(`  ✓ Created scripts/agentinbox.md`);
  console.log(`  Edit it to describe your project stack and any routing rules.`);
  process.exit(0);
}

// ── mcp ──────────────────────────────────────────────────────────────────────
if (command === "mcp") {
  const port = getArg("--port") || "3000";
  console.log(`
  Add AgentInbox MCP to Claude globally:

    claude mcp add --scope user agentinbox http://localhost:${port}/mcp

  Or add to your project's .mcp.json:

    {
      "mcpServers": {
        "agentinbox": {
          "url": "http://localhost:${port}/mcp"
        }
      }
    }
`);
  process.exit(0);
}

// ── router ───────────────────────────────────────────────────────────────────
if (command === "router") {
  const configFile = getArg("--config") || path.join(process.cwd(), "projects.json");
  const port = parseInt(getArg("--port") || "4001", 10);
  const secret = getArg("--secret") || process.env.WEBHOOK_SECRET || "";

  if (!fs.existsSync(configFile)) {
    // Scaffold a starter projects.json
    const starter = JSON.stringify([
      { token: "YOUR_PROJECT_TOKEN", dir: "/path/to/your/project", name: "My Project" }
    ], null, 2);
    fs.writeFileSync(configFile, starter);
    console.log(`  Created ${configFile} — edit it with your project tokens and directories, then re-run.`);
    process.exit(0);
  }

  let projects: { token: string; dir: string; name: string }[];
  try {
    projects = JSON.parse(fs.readFileSync(configFile, "utf-8"));
  } catch (e) {
    console.error(`  Failed to parse ${configFile}: ${e}`);
    process.exit(1);
  }

  // Inline router logic (no external dep on claude-router.js)
  const http = require("http");
  const { spawn } = require("child_process");
  const os = require("os");

  const projectMap: Record<string, { token: string; dir: string; name: string }> = {};
  const state: Record<string, { running: boolean; queue: string[] }> = {};
  for (const p of projects) {
    projectMap[p.token] = p;
    state[p.token] = { running: false, queue: [] };
  }

  function runClaude(token: string) {
    const project = projectMap[token];
    const s = state[token];
    if (s.running) { s.queue.push("pending"); return; }
    s.running = true;
    console.log(`\n  [${project.name}] Triggering Claude in ${project.dir}`);

    const mdFile = path.join(project.dir, "scripts", "agentinbox.md");
    const prompt = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, "utf-8") : [
      "You are an autonomous agent. Do not chat. Execute these steps immediately:",
      "1. Call mcp__agentinbox__get_pending_tasks.",
      "2. For each task: update_task_status(in_progress), get_task, get_file if has_file, fix it, complete_task.",
      "3. If stuck, escalate_task. Process ALL tasks. Start now.",
    ].join(" ");

    const tmp = path.join(os.tmpdir(), `agentinbox-${token.slice(0, 8)}-${Date.now()}.txt`);
    fs.writeFileSync(tmp, prompt, "utf-8");

    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn("powershell", ["-NoProfile", "-Command", `Get-Content -Raw "${tmp}" | claude --dangerously-skip-permissions --print`], { cwd: project.dir, stdio: "inherit", shell: false })
      : spawn("sh", ["-c", `cat "${tmp}" | claude --dangerously-skip-permissions --print`], { cwd: project.dir, stdio: "inherit" });

    child.on("close", (code: number) => {
      try { fs.unlinkSync(tmp); } catch {}
      s.running = false;
      console.log(`  [${project.name}] Claude finished (exit ${code})`);
      if (s.queue.length > 0) {
        s.queue.length = 0;
        setTimeout(() => runClaude(token), 2000);
      }
    });
  }

  const server = http.createServer((req: any, res: any) => {
    if (req.method !== "POST" || req.url !== "/webhook") { res.writeHead(404); res.end(); return; }
    if (secret && req.headers["x-agentinbox-secret"] !== secret) { res.writeHead(401); res.end(); return; }
    let body = "";
    req.on("data", (c: any) => (body += c));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        if (payload.event !== "task.created") { res.writeHead(200); res.end("ignored"); return; }
        const project = projectMap[payload.project_token];
        if (!project) { res.writeHead(200); res.end("ignored"); return; }
        console.log(`  [${project.name}] New task: "${payload.title}"`);
        res.writeHead(200); res.end("ok");
        runClaude(payload.project_token);
      } catch { res.writeHead(400); res.end(); }
    });
  });

  server.listen(port, () => {
    const line = "─".repeat(55);
    console.log(`\n  ┌${line}┐`);
    console.log(`  │${"   AgentInbox Router".padEnd(55)}│`);
    console.log(`  ├${line}┤`);
    console.log(`  │  Webhook: http://localhost:${port}/webhook${" ".repeat(55 - 30 - port.toString().length)}│`);
    console.log(`  │  Projects: ${projects.length}${" ".repeat(55 - 12 - projects.length.toString().length)}│`);
    console.log(`  ├${line}┤`);
    for (const p of projects) {
      const line2 = `  • ${p.name} → ${p.dir}`;
      console.log(`  │  ${line2.slice(0, 52).padEnd(52)} │`);
    }
    console.log(`  └${line}┘\n`);
    console.log(`  Waiting for tasks... (Ctrl+C to stop)\n`);
  });

  process.on("SIGINT", () => { server.close(() => process.exit(0)); });
} else if (command === "start") {
// ── start ────────────────────────────────────────────────────────────────────
  const cwdEnv = path.resolve(process.cwd(), ".env");
  const pkgEnv = path.resolve(__dirname, "../.env");
  const envPath = fs.existsSync(cwdEnv) ? cwdEnv : pkgEnv;
  dotenv.config({ path: envPath });

  const portArg = getArg("--port");
  const dataArg = getArg("--data");
  if (portArg) process.env.PORT = portArg;
  if (dataArg) process.env.DATA_DIR = dataArg;

  const PORT = parseInt(process.env.PORT || "3000", 10);

  import("./index").then(({ createApp }) => {
    const app = createApp();
    app.listen(PORT, () => {
      const line = "─".repeat(45);
      console.log(`\n  ┌${line}┐`);
      console.log(`  │${"   AgentInbox is running".padEnd(45)}│`);
      console.log(`  └${line}┘\n`);
      console.log(`  Dashboard: http://localhost:${PORT}/pm`);
      console.log(`  Submit:    http://localhost:${PORT}/submit/<token>`);
      console.log(`  MCP:       http://localhost:${PORT}/mcp\n`);
      console.log(`  Add to Claude:  claude mcp add --scope user agentinbox http://localhost:${PORT}/mcp\n`);
      if (!process.env.API_KEY) {
        console.log(`  ⚠  No API_KEY set — PM dashboard is open to anyone.`);
        console.log(`     Add API_KEY=your-secret to .env to secure it.\n`);
      }
    });
  });
} else {
  console.error(`  Unknown command: ${command}`);
  console.error(`  Run "agentinbox help" for usage.`);
  process.exit(1);
}

function getArg(name: string): string | null {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
