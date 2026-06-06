#!/usr/bin/env node
/**
 * AgentInbox Test 2 — Messy codebase stress test.
 *
 * Tests that Claude can:
 *   1. Figure out messy/chaotic project structures
 *   2. Fix tasks correctly without developer intervention
 *   3. Write useful CLAUDE.local.md rules (checked post-run)
 *
 * Usage:
 *   node simulate-messy.js                    # all scenarios
 *   node simulate-messy.js --scenario monorepo
 *   node simulate-messy.js --scenario legacy
 *   node simulate-messy.js --scenario nodocs
 *   node simulate-messy.js --scenario mixed
 *   node simulate-messy.js --scenario huge
 *
 * Stacks run sequentially. Each scenario:
 *   - Submits ONE representative task
 *   - Reports pass/fail + Claude's plain summary
 *   - Prints CLAUDE.local.md content if Claude wrote one
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");

// ── Config ────────────────────────────────────────────────────────────────────

const SERVER_URL = "https://useagentinbox.com";
const LOGIN_EMAIL = "robin.devkota@amniltech.com";
const LOGIN_PASSWORD = "Super@123";
const TASK_TIMEOUT_MS = 6 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

const SINGLE = (() => {
  const idx = process.argv.indexOf("--scenario");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ── Scenario definitions ──────────────────────────────────────────────────────

function repeat(fn, n) {
  const out = {};
  for (let i = 0; i < n; i++) Object.assign(out, fn(i));
  return out;
}

const SCENARIOS = [
  // ── 1. Monorepo ────────────────────────────────────────────────────────────
  {
    name: "monorepo",
    description: "packages/frontend + backend + shared — Claude must navigate multi-package structure",
    files: {
      "package.json": JSON.stringify({ name: "my-monorepo", private: true, workspaces: ["packages/*"] }, null, 2),
      "packages/shared/index.js": `exports.formatPrice = (p) => '$' + p.toFixed(2);\nexports.VERSION = '1.0.0';\n`,
      "packages/shared/package.json": JSON.stringify({ name: "@myapp/shared", version: "1.0.0" }, null, 2),
      "packages/frontend/package.json": JSON.stringify({ name: "@myapp/frontend", version: "1.0.0", dependencies: { "@myapp/shared": "*" } }, null, 2),
      "packages/frontend/src/App.jsx": `import { formatPrice } from '@myapp/shared';\nexport default function App() {\n  const price = formatPrice(9.9); // should be 9.99\n  return <div>{price}</div>;\n}\n`,
      "packages/frontend/src/components/Header.jsx": `export default function Header({ title }) {\n  return <h1>{title}</h1>;\n}\n`,
      "packages/backend/package.json": JSON.stringify({ name: "@myapp/backend", version: "1.0.0" }, null, 2),
      "packages/backend/src/server.js": `const express = require('express');\nconst { VERSION } = require('@myapp/shared');\nconst app = express();\napp.get('/version', (req, res) => res.json({ version: VERSION }));\napp.listen(4000);\n`,
      "packages/backend/src/routes/products.js": `module.exports = (app) => {\n  app.get('/products', (req, res) => res.json([{ id: 1, name: 'Widget', price: 9.99 }]));\n};\n`,
      "README.md": `# My Monorepo\nPackages: frontend, backend, shared.\n`,
    },
    task: {
      title: "Fix price arg in App.jsx",
      description: "In packages/frontend/src/App.jsx, the call formatPrice(9.9) should be formatPrice(9.99) — the price is missing the last digit. Fix the argument.",
      priority: "low",
    },
  },

  // ── 2. Legacy mess ─────────────────────────────────────────────────────────
  {
    name: "legacy",
    description: "src/old-stuff, utils-v1, utils-v2, random scripts — chaotic folder structure",
    files: {
      "package.json": JSON.stringify({ name: "legacy-app", version: "0.0.1" }, null, 2),
      "src/old-stuff/auth.js": `// OLD — do not use\nfunction login(u, p) { return u === 'admin' && p === 'password'; }\nmodule.exports = { login };\n`,
      "src/new-stuff/auth.js": `// Current auth module\nfunction login(username, password) {\n  if (!username || !password) return false;\n  return username.length > 3 && password.length > 6;\n}\nmodule.exports = { login };\n`,
      "src/new-stuff/user.js": `const { login } = require('./auth');\nfunction getUser(u, p) {\n  if (!login(u, p)) return null;\n  return { id: 1, username: u, role: 'user' };\n}\nmodule.exports = { getUser };\n`,
      "utils-v1/format.js": `exports.formatDate = (d) => d.toString();\nexports.formatMoney = (n) => n + ' USD';\n`,
      "utils-v2/format.js": `exports.formatDate = (d) => new Date(d).toLocaleDateString();\nexports.formatMoney = (n) => '$' + parseFloat(n).toFixed(2);\n`,
      "utils-v2/validate.js": `exports.isEmail = (e) => /^[^@]+@[^@]+\\.[^@]+$/.test(e);\nexports.isPhone = (p) => /^\\d{10}$/.test(p);\n`,
      "scripts/migrate.js": `// one-off migration script\nconsole.log('migrating...');\n`,
      "scripts/seed.js": `// seed dev data\nconsole.log('seeding...');\n`,
      "index.js": `const { getUser } = require('./src/new-stuff/user');\nconst { formatMoney } = require('./utils-v2/format');\nconst user = getUser('alice', 'secret123');\nconsole.log(user, formatMoney(9.99));\n`,
      "config.js": `module.exports = { PORT: 3000, DB: 'sqlite://dev.db', DEBUG: true };\n`,
    },
    task: {
      title: "Fix formatMoney in utils-v2/format.js",
      description: "In utils-v2/format.js, the formatMoney function outputs '$9.99' but it should include a space: '$ 9.99'. Add a space after the dollar sign.",
      priority: "medium",
    },
  },

  // ── 3. No docs ─────────────────────────────────────────────────────────────
  {
    name: "nodocs",
    description: "Raw code, no README, no comments — Claude must infer structure with zero context",
    files: {
      "package.json": JSON.stringify({ name: "app", version: "1.0.0", main: "app.js" }, null, 2),
      "app.js": `const r = require('./router');\nconst s = require('./store');\nconst p = parseInt(process.env.PORT || '3000');\nr.init(s);\nr.listen(p);\n`,
      "router.js": `const h = require('./handlers');\nlet _store;\nmodule.exports = {\n  init(store) { _store = store; },\n  listen(port) {\n    const http = require('http');\n    const srv = http.createServer((req, res) => {\n      if (req.url === '/items' && req.method === 'GET') return h.listItems(req, res, _store);\n      if (req.url === '/status' && req.method === 'GET') return h.status(req, res);\n      res.writeHead(404); res.end('not found');\n    });\n    srv.listen(port, () => console.log('up on ' + port));\n  }\n};\n`,
      "handlers.js": `module.exports = {\n  listItems(req, res, store) {\n    res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify(store.all()));\n  },\n  status(req, res) {\n    res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ ok: treu })); // typo: treu\n  }\n};\n`,
      "store.js": `const items = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];\nmodule.exports = { all: () => items, add: (x) => items.push(x) };\n`,
    },
    task: {
      title: "Fix typo in handlers.js status response",
      description: "In handlers.js, the status handler returns { ok: treu } — 'treu' is a typo and will cause a ReferenceError at runtime. Change it to { ok: true }.",
      priority: "high",
    },
  },

  // ── 4. Mixed stack ─────────────────────────────────────────────────────────
  {
    name: "mixed",
    description: "React frontend + Python API + Node scripts in one repo",
    files: {
      "README.md": `# Mixed Stack App\nFrontend: React (frontend/)\nAPI: Python Flask (api/)\nScripts: Node.js (scripts/)\n`,
      "frontend/package.json": JSON.stringify({ name: "frontend", version: "1.0.0" }, null, 2),
      "frontend/src/App.jsx": `import React, { useState } from 'react';\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(count - 1)}>Increment</button>\n    </div>\n  );\n}\n`,
      "frontend/src/index.js": `import React from 'react';\nimport ReactDOM from 'react-dom';\nimport App from './App';\nReactDOM.render(<App />, document.getElementById('root'));\n`,
      "api/app.py": `from flask import Flask, jsonify\napp = Flask(__name__)\n\n@app.route('/api/items')\ndef items():\n    return jsonify([{'id': 1, 'name': 'Widget'}])\n\nif __name__ == '__main__':\n    app.run(port=5000)\n`,
      "api/requirements.txt": "flask==2.3.0\n",
      "scripts/build.js": `const { execSync } = require('child_process');\nconsole.log('Building frontend...');\nexecSync('cd frontend && npm run build', { stdio: 'inherit' });\n`,
      "scripts/deploy.js": `console.log('Deploying...');\n`,
    },
    task: {
      title: "Fix Increment button in App.jsx",
      description: "In frontend/src/App.jsx, the Increment button calls setCount(count - 1) which decrements instead of incrementing. Change it to setCount(count + 1).",
      priority: "medium",
    },
  },

  // ── 5. Huge codebase ───────────────────────────────────────────────────────
  {
    name: "huge",
    description: "500+ files — Claude must scan without hitting context limits",
    files: (() => {
      const files = {
        "package.json": JSON.stringify({ name: "huge-app", version: "1.0.0" }, null, 2),
        "README.md": "# Huge App\nA large codebase with many files.\n",
        // The actual bug lives here
        "src/core/config.js": `module.exports = {\n  APP_NAME: 'Huge App',\n  VERSION: '2.0.0',\n  MAX_RETRIES: 3,\n  TIMEOUT_MS: 5000,\n  BASE_URL: 'htps://api.example.com', // typo: htps\n};\n`,
        "src/core/logger.js": `module.exports = { log: (m) => console.log('[app]', m), error: (m) => console.error('[err]', m) };\n`,
        "src/core/utils.js": `exports.sleep = (ms) => new Promise(r => setTimeout(r, ms));\nexports.clamp = (n, min, max) => Math.min(Math.max(n, min), max);\n`,
      };

      // Generate 500 filler files across realistic module directories
      const modules = ["auth", "users", "products", "orders", "payments", "reports", "notifications", "search", "analytics", "admin"];
      const subfiles = ["controller", "service", "model", "validator", "routes", "tests", "helpers", "constants", "types", "middleware"];

      for (const mod of modules) {
        for (const sub of subfiles) {
          files[`src/modules/${mod}/${sub}.js`] =
            `// ${mod} ${sub}\nmodule.exports = {};\n`;
          // add a few nested ones for depth
          files[`src/modules/${mod}/utils/${sub}.js`] =
            `// ${mod} utils ${sub}\nmodule.exports = {};\n`;
          files[`src/modules/${mod}/tests/${sub}.test.js`] =
            `// ${mod} ${sub} tests\ndescribe('${mod} ${sub}', () => { it('exists', () => {}); });\n`;
        }
        // index per module
        files[`src/modules/${mod}/index.js`] =
          `module.exports = require('./controller');\n`;
      }

      // Shared utilities
      for (let i = 0; i < 20; i++) {
        files[`src/shared/util-${i}.js`] = `module.exports = { fn${i}: () => ${i} };\n`;
      }

      // Config files
      for (let i = 0; i < 10; i++) {
        files[`config/env-${i}.json`] = JSON.stringify({ env: `env-${i}`, port: 3000 + i }, null, 2) + "\n";
      }

      return files;
    })(),
    task: {
      title: "Fix BASE_URL typo in src/core/config.js",
      description: "In src/core/config.js, the BASE_URL value is 'htps://api.example.com' — 'htps' is missing the second 't'. Change it to 'https://api.example.com'.",
      priority: "high",
    },
  },
];

// ── Helpers (same as simulate-pipe.js) ───────────────────────────────────────

function log(prefix, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${prefix}] ${msg}`);
}

async function apiFetch(path, options = {}) {
  const fetch = (await import("node-fetch")).default;
  const url = `${SERVER_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

async function login() {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  return { token: data.token, workspaceId: data.workspaceId };
}

async function createTestProject(jwt, workspaceId, name) {
  return apiFetch(`/workspaces/${workspaceId}/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ name: `messy-${name}-${Date.now()}`, require_approval: false }),
  });
}

async function deleteProject(jwt, projectId) {
  return apiFetch(`/projects/${projectId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  }).catch(() => {});
}

async function submitTask(projectToken, task) {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch(`${SERVER_URL}/api/submit/${projectToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`submit failed: ${JSON.stringify(body)}`);
  return body;
}

async function pollTaskUntilDone(jwt, taskId, timeoutMs) {
  const fetch = (await import("node-fetch")).default;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${SERVER_URL}/api/tasks/${taskId}/status`);
    const task = await res.json();
    log("poll", `task ${taskId.slice(0, 8)} → ${task.status}`);
    if (["done", "escalated", "failed"].includes(task.status)) return task;
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s`);
}

function createFiles(dir, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

function writeMcpJson(dir, wsToken) {
  const config = {
    mcpServers: {
      agentinbox: {
        command: "npx",
        args: ["-y", "agentinbox-mcp"],
        env: { AGENTINBOX_TOKEN: wsToken },
      },
    },
  };
  fs.writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify(config, null, 2));
}

function buildWorkerJs(wsToken) {
  return `const { io } = require("socket.io-client");
const { spawn, execSync } = require("child_process");
const { existsSync } = require("fs");

const TOKEN = "${wsToken}";
const SERVER_URL = "${SERVER_URL}";
const PROJECT_CWD = __dirname;

function findClaude() {
  try { execSync("claude --version", { stdio: "ignore" }); return "claude"; } catch {}
  const p = process.env.CLAUDE_PATH;
  if (p && existsSync(p)) return p;
  return "claude";
}

const CLAUDE_PATH = findClaude();
const TASK_PROMPT =
  "Check AgentInbox for pending tasks using get_pending_tasks. " +
  "For each pending task: call update_task_status(in_progress), call get_task for full details, " +
  "fix the issue in the codebase, then call complete_task with a technical summary and plain-English summary. " +
  "If no pending tasks, exit.";

let claudeRunning = false;

function spawnClaude() {
  if (claudeRunning) { console.log("[worker] Claude already running"); return; }
  claudeRunning = true;
  console.log("[worker] Waking Claude in " + PROJECT_CWD);
  const proc = spawn(CLAUDE_PATH, ["--dangerously-skip-permissions", "--print", TASK_PROMPT], {
    cwd: PROJECT_CWD, stdio: "inherit", detached: false
  });
  proc.on("error", (err) => { console.error("[worker] Failed: " + err.message); claudeRunning = false; });
  proc.on("close", (code) => { console.log("[worker] Claude exited (" + code + ")"); claudeRunning = false; });
}

const socket = io(SERVER_URL, {
  path: "/agent-socket",
  auth: { token: TOKEN },
  reconnection: true,
  reconnectionDelay: 5000,
  reconnectionAttempts: Infinity,
});

socket.on("connect", () => console.log("[worker] Connected to AgentInbox"));
socket.on("connected", (d) => console.log("[worker] Workspace: " + d.workspace_name));
socket.on("task.created", (p) => { console.log("[worker] Task: \\"" + p.title + "\\""); spawnClaude(); });
socket.on("connect_error", (e) => console.error("[worker] Error: " + e.message));
socket.on("disconnect", (r) => console.log("[worker] Disconnected: " + r));

setInterval(() => {}, 60000);
console.log("[worker] Starting...");
`;
}

function countFiles(files) {
  return Object.keys(files).length;
}

// ── Run one scenario ──────────────────────────────────────────────────────────

async function runScenario(scenario, jwt, wsToken, wsId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aib-messy-${scenario.name}-`));
  let project = null;
  let workerProc = null;

  try {
    const fileCount = countFiles(scenario.files);
    log(scenario.name, `Temp dir: ${dir} (${fileCount} files)`);

    // Write files
    createFiles(dir, scenario.files);
    log(scenario.name, `Files written`);

    // Install socket.io-client
    log(scenario.name, "npm install socket.io-client...");
    execSync("npm install socket.io-client --save --loglevel=error", { cwd: dir, stdio: "pipe" });

    // Write worker + MCP config
    fs.writeFileSync(path.join(dir, "agentinbox-worker.js"), buildWorkerJs(wsToken));
    writeMcpJson(dir, wsToken);
    log(scenario.name, "worker.js + .mcp.json written");

    // Create project
    project = await createTestProject(jwt, wsId, scenario.name);
    log(scenario.name, `Project: ${project.id.slice(0, 8)}... token: ${project.token.slice(0, 8)}...`);

    // Start worker
    const workerConnected = new Promise((resolve, reject) => {
      workerProc = spawn("node", ["agentinbox-worker.js"], {
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const onData = (chunk) => {
        const line = chunk.toString();
        process.stdout.write(`  [worker:${scenario.name}] ${line}`);
        if (line.includes("Connected to AgentInbox")) resolve();
      };
      workerProc.stdout.on("data", onData);
      workerProc.stderr.on("data", onData);
      workerProc.on("error", reject);
      workerProc.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`Worker exited ${code}`));
      });
      setTimeout(() => reject(new Error("Worker did not connect within 30s")), 30000);
    });

    log(scenario.name, "Waiting for worker...");
    await workerConnected;
    log(scenario.name, "Worker connected!");

    // Submit task
    const submitted = await submitTask(project.token, scenario.task);
    log(scenario.name, `Task submitted: ${submitted.id.slice(0, 8)}...`);

    // Poll until done
    log(scenario.name, `Polling (timeout: ${TASK_TIMEOUT_MS / 1000}s)...`);
    const result = await pollTaskUntilDone(jwt, submitted.id, TASK_TIMEOUT_MS);

    // Check if CLAUDE.local.md was written
    const claudeMdPath = path.join(dir, "CLAUDE.local.md");
    const claudeMdExists = fs.existsSync(claudeMdPath);
    const claudeMdContent = claudeMdExists ? fs.readFileSync(claudeMdPath, "utf-8") : null;

    if (result.status === "done") {
      log(scenario.name, `✅ PASS — ${result.summary_plain}`);
      if (claudeMdContent) {
        log(scenario.name, `CLAUDE.local.md written (${claudeMdContent.length} chars):`);
        console.log("  " + claudeMdContent.split("\n").slice(0, 10).join("\n  ") + (claudeMdContent.split("\n").length > 10 ? "\n  ..." : ""));
      } else {
        log(scenario.name, "CLAUDE.local.md: not written (Claude went straight to the fix)");
      }
      return { scenario: scenario.name, passed: true, taskId: submitted.id, summary: result.summary_plain, wroteDocs: claudeMdExists };
    } else {
      log(scenario.name, `❌ FAIL — status: ${result.status}`);
      return { scenario: scenario.name, passed: false, taskId: submitted.id, status: result.status };
    }
  } catch (err) {
    log(scenario.name, `❌ ERROR — ${err.message}`);
    return { scenario: scenario.name, passed: false, error: err.message };
  } finally {
    if (workerProc) { workerProc.kill(); log(scenario.name, "Worker stopped"); }
    if (project) { await deleteProject(jwt, project.id); log(scenario.name, "Project cleaned up"); }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    log(scenario.name, "Temp dir cleaned up");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== AgentInbox Messy Codebase Stress Test ===");
  console.log(`Server: ${SERVER_URL}`);
  if (SINGLE) console.log(`Scenario filter: ${SINGLE}`);
  console.log("NOTE: Uses real workspace. Projects cleaned up after each run.\n");

  const { token: jwt, workspaceId } = await login();
  log("auth", `Logged in — workspace: ${workspaceId}`);

  const tokenData = await apiFetch(`/workspaces/${workspaceId}/token`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const wsToken = tokenData.token;
  log("auth", `Workspace token: ${wsToken.slice(0, 12)}...`);

  const scenarios = SINGLE
    ? SCENARIOS.filter((s) => s.name === SINGLE)
    : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`Unknown scenario: ${SINGLE}. Available: ${SCENARIOS.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  const results = [];
  for (const scenario of scenarios) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Scenario: ${scenario.name}`);
    console.log(`          ${scenario.description}`);
    console.log("─".repeat(60));
    const result = await runScenario(scenario, jwt, wsToken, workspaceId);
    results.push(result);
  }

  console.log("\n" + "═".repeat(60));
  console.log("STRESS TEST RESULTS");
  console.log("═".repeat(60));
  let passed = 0;
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const docs = r.passed ? (r.wroteDocs ? " [docs written]" : " [no docs]") : "";
    const detail = r.passed
      ? `"${r.summary}"${docs}`
      : `${r.status || "error"}: ${r.error || ""}`;
    console.log(`${icon} ${r.scenario.padEnd(15)} ${detail}`);
    if (r.passed) passed++;
  }
  console.log("─".repeat(60));
  console.log(`${passed}/${results.length} passed`);
  console.log("");

  if (passed < results.length) process.exit(1);
}

main().catch((err) => {
  console.error("\n[fatal]", err.message);
  process.exit(1);
});
