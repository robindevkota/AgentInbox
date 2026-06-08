#!/usr/bin/env node
"use strict";
/**
 * agentinbox-mcp — MCP server that connects Claude to AgentInbox via WebSocket.
 *
 * Setup (one time): add to .mcp.json
 * {
 *   "mcpServers": {
 *     "agentinbox": {
 *       "command": "npx",
 *       "args": ["-y", "agentinbox-mcp"],
 *       "env": { "AGENTINBOX_TOKEN": "wt_xxx" }
 *     }
 *   }
 * }
 *
 * Every time Claude Code opens, this process starts, connects to the
 * AgentInbox server via WebSocket, and exposes all task tools to Claude.
 * No ngrok. No router. No extra terminals.
 *
 * When a task arrives via WebSocket, this process spawns Claude headlessly
 * to process the task — no polling, no persistent loop, no open terminal needed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const socket_io_client_1 = require("socket.io-client");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const TOKEN = process.env.AGENTINBOX_TOKEN;
const SERVER_URL = process.env.AGENTINBOX_URL || "https://useagentinbox.com";
const API_BASE = `${SERVER_URL}/api`;
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const PROJECT_CWD = process.env.CLAUDE_PROJECT_PATH || process.cwd();
// ── Claude wake-on-task ───────────────────────────────────────────────────────
// Spawns a headless Claude process when a task arrives. Uses a lockfile instead
// of an in-memory flag so that an active interactive Claude session (like the
// developer chatting) does not block task processing. The spawned Claude writes
// the lockfile; the interactive Claude never touches it.
const LOCKFILE = (0, path_1.join)(PROJECT_CWD, ".agentinbox-running");
const LOCKFILE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes — stale after this
function isTaskClaudeRunning() {
    if (!(0, fs_1.existsSync)(LOCKFILE))
        return false;
    try {
        const age = Date.now() - (0, fs_1.statSync)(LOCKFILE).mtimeMs;
        if (age > LOCKFILE_MAX_AGE_MS) {
            // Stale lockfile from a crash or machine reboot — remove it
            process.stderr.write(`[agentinbox-mcp] Stale lockfile (${Math.round(age / 60000)}m old) — removing\n`);
            (0, fs_1.unlinkSync)(LOCKFILE);
            return false;
        }
    }
    catch {
        return false;
    }
    return true;
}
const TASK_PROMPT = "Check AgentInbox for pending tasks using get_pending_tasks. " +
    "For each pending task: call update_task_status(in_progress), call get_task for full details, " +
    "fix the issue in the codebase, then call complete_task with a technical summary and plain-English summary. " +
    "If you use ask_developer or propose_plan and need to poll for a reply: poll get_task every 30s, " +
    "but give up after 5 minutes maximum — if no reply, proceed with best judgment and note it in summary_technical. " +
    "Never poll indefinitely. " +
    "If no pending tasks, exit.";
function spawnClaude() {
    if (isTaskClaudeRunning()) {
        process.stderr.write("[agentinbox-mcp] Task Claude already running (lockfile present) — task will be queued\n");
        return;
    }
    process.stderr.write(`[agentinbox-mcp] Waking Claude in ${PROJECT_CWD}\n`);
    try {
        (0, fs_1.writeFileSync)(LOCKFILE, String(process.pid));
    }
    catch (e) {
        process.stderr.write(`[agentinbox-mcp] Warning: could not write lockfile: ${e}\n`);
    }
    // Use --print so Claude runs headlessly and exits when done.
    // This process (agentinbox-mcp) stays alive independently — the MCP connection
    // to the parent Claude Code session is NOT affected by this spawn.
    const proc = (0, child_process_1.spawn)(CLAUDE_PATH, ["--dangerously-skip-permissions", "--print", TASK_PROMPT], { cwd: PROJECT_CWD, stdio: "inherit", detached: false });
    proc.on("error", (err) => {
        process.stderr.write(`[agentinbox-mcp] Failed to spawn Claude: ${err.message}\n`);
        process.stderr.write(`[agentinbox-mcp] Set CLAUDE_PATH env var if claude is not in PATH\n`);
        try {
            (0, fs_1.unlinkSync)(LOCKFILE);
        }
        catch { }
    });
    proc.on("close", (code) => {
        process.stderr.write(`[agentinbox-mcp] Claude exited (code ${code})\n`);
        try {
            (0, fs_1.unlinkSync)(LOCKFILE);
        }
        catch { }
    });
}
if (!TOKEN) {
    process.stderr.write("[agentinbox-mcp] ERROR: AGENTINBOX_TOKEN env var is required\n");
    process.exit(1);
}
// ── REST API helpers ──────────────────────────────────────────────────────────
async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok)
        throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
}
async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
}
// ── Workspace resolution via token ────────────────────────────────────────────
// The workspace token is different from the JWT auth token.
// We use a dedicated endpoint to validate the workspace token and get tasks.
async function getWorkspaceIdFromToken() {
    try {
        const res = await fetch(`${SERVER_URL}/api/agent/workspace`, {
            headers: { "x-workspace-token": TOKEN },
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        return data.workspace_id ?? null;
    }
    catch {
        return null;
    }
}
// ── MCP tool implementations (call server REST API) ──────────────────────────
async function getPendingTasks() {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/pending`, {
        headers: { "x-workspace-token": TOKEN },
    });
    if (!res.ok)
        throw new Error(`get_pending_tasks failed: ${res.status}`);
    return res.json();
}
async function getTask(id) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}`, {
        headers: { "x-workspace-token": TOKEN },
    });
    if (!res.ok)
        throw new Error(`get_task failed: ${res.status}`);
    return res.json();
}
async function getFile(taskId) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${taskId}/file`, {
        headers: { "x-workspace-token": TOKEN },
    });
    if (!res.ok)
        throw new Error(`get_file failed: ${res.status}`);
    return res.json();
}
async function updateTaskStatus(id, status) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN },
        body: JSON.stringify({ status }),
    });
    if (!res.ok)
        throw new Error(`update_task_status failed: ${res.status}`);
    return res.json();
}
async function completeTask(id, summaryTechnical, summaryPlain, screenshotBase64) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN },
        body: JSON.stringify({ summary_technical: summaryTechnical, summary_plain: summaryPlain, screenshot_base64: screenshotBase64 }),
    });
    if (!res.ok)
        throw new Error(`complete_task failed: ${res.status}`);
    return res.json();
}
async function escalateTask(id, reason) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN },
        body: JSON.stringify({ reason }),
    });
    if (!res.ok)
        throw new Error(`escalate_task failed: ${res.status}`);
    return res.json();
}
async function proposePlan(id, plan) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN },
        body: JSON.stringify({ plan }),
    });
    if (!res.ok)
        throw new Error(`propose_plan failed: ${res.status}`);
    return res.json();
}
async function askDeveloper(id, question) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN },
        body: JSON.stringify({ question }),
    });
    if (!res.ok)
        throw new Error(`ask_developer failed: ${res.status}`);
    return res.json();
}
async function notifyDeveloper(id, message) {
    const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN },
        body: JSON.stringify({ reply: message }),
    });
    if (!res.ok)
        throw new Error(`notify_developer failed: ${res.status}`);
    return res.json();
}
// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: "agentinbox", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "get_pending_tasks",
            description: "Get all pending tasks in the AgentInbox workspace",
            inputSchema: { type: "object", properties: {}, required: [] },
        },
        {
            name: "get_task",
            description: "Get full details of a specific task by ID",
            inputSchema: {
                type: "object",
                properties: { id: { type: "string", description: "Task ID" } },
                required: ["id"],
            },
        },
        {
            name: "get_file",
            description: "Get the file attachment for a task (PDF, image, etc)",
            inputSchema: {
                type: "object",
                properties: { task_id: { type: "string", description: "Task ID" } },
                required: ["task_id"],
            },
        },
        {
            name: "update_task_status",
            description: "Update the status of a task (e.g. in_progress, blocked)",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Task ID" },
                    status: { type: "string", enum: ["in_progress", "blocked", "failed"] },
                },
                required: ["id", "status"],
            },
        },
        {
            name: "complete_task",
            description: "Mark a task as done with technical and plain-English summaries",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Task ID" },
                    summary_technical: { type: "string", description: "Technical summary for PM (file changed, line number, etc)" },
                    summary_plain: { type: "string", description: "Plain English summary for the client" },
                    screenshot_base64: { type: "string", description: "Optional base64 PNG screenshot as proof" },
                },
                required: ["id", "summary_technical", "summary_plain"],
            },
        },
        {
            name: "escalate_task",
            description: "Escalate a task that cannot be solved automatically",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Task ID" },
                    reason: { type: "string", description: "Why the task cannot be solved" },
                },
                required: ["id", "reason"],
            },
        },
        {
            name: "propose_plan",
            description: "Propose a fix plan for PM approval before executing",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Task ID" },
                    plan: { type: "string", description: "Plain English description of the proposed fix" },
                },
                required: ["id", "plan"],
            },
        },
        {
            name: "ask_developer",
            description: "Ask the developer a question via Telegram when you need clarification. Claude polls get_task(id) every 30s — when developer_reply is set, continue. If no reply after 5 min, proceed with best judgment and log your decision.",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Task ID" },
                    question: { type: "string", description: "The question to ask the developer" },
                },
                required: ["id", "question"],
            },
        },
        {
            name: "notify_developer",
            description: "Send a one-way notification to the developer via Telegram (no reply needed)",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Task ID" },
                    message: { type: "string", description: "The message to send" },
                },
                required: ["id", "message"],
            },
        },
    ],
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        let result;
        switch (name) {
            case "get_pending_tasks":
                result = await getPendingTasks();
                break;
            case "get_task":
                result = await getTask(args.id);
                break;
            case "get_file": {
                const fileResult = await getFile(args.task_id);
                // Return image as a vision-readable content block if it's an image
                if (fileResult.file_data && fileResult.media_type) {
                    return { content: [
                            { type: "text", text: `File: ${fileResult.file_name}` },
                            { type: "image", data: fileResult.file_data, mimeType: fileResult.media_type },
                        ] };
                }
                return { content: [{ type: "text", text: JSON.stringify(fileResult, null, 2) }] };
            }
            case "update_task_status":
                result = await updateTaskStatus(args.id, args.status);
                break;
            case "complete_task":
                result = await completeTask(args.id, args.summary_technical, args.summary_plain, args.screenshot_base64);
                break;
            case "escalate_task":
                result = await escalateTask(args.id, args.reason);
                break;
            case "propose_plan":
                result = await proposePlan(args.id, args.plan);
                break;
            case "ask_developer":
                result = await askDeveloper(args.id, args.question);
                break;
            case "notify_developer":
                result = await notifyDeveloper(args.id, args.message);
                break;
            default: throw new Error(`Unknown tool: ${name}`);
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
});
// ── WebSocket connection (receives task.created events from server) ────────────
function connectSocket() {
    const socket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: "/agent-socket",
        auth: { token: TOKEN },
        reconnection: true,
        reconnectionDelay: 5000,
        reconnectionAttempts: Infinity,
    });
    socket.on("connect", () => {
        process.stderr.write(`[agentinbox-mcp] Connected to AgentInbox server\n`);
    });
    socket.on("connected", (data) => {
        process.stderr.write(`[agentinbox-mcp] Workspace: ${data.workspace_name} (${data.workspace_id})\n`);
    });
    socket.on("task.created", (payload) => {
        process.stderr.write(`[agentinbox-mcp] New task: "${payload.title}" (${payload.task_id})\n`);
        spawnClaude();
    });
    socket.on("connect_error", (err) => {
        process.stderr.write(`[agentinbox-mcp] Connection error: ${err.message}\n`);
    });
    socket.on("disconnect", (reason) => {
        process.stderr.write(`[agentinbox-mcp] Disconnected: ${reason} — reconnecting...\n`);
    });
    return socket;
}
// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function main() {
    // Connect WebSocket to receive real-time task events
    connectSocket();
    // Start MCP server over stdio (Claude Code connects here)
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[agentinbox-mcp] MCP server ready\n`);
}
main().catch((err) => {
    process.stderr.write(`[agentinbox-mcp] Fatal: ${err.message}\n`);
    process.exit(1);
});
