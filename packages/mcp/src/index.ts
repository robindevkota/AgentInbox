#!/usr/bin/env node
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
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { io as SocketClient, Socket } from "socket.io-client";

const TOKEN = process.env.AGENTINBOX_TOKEN;
const SERVER_URL = process.env.AGENTINBOX_URL || "https://useagentinbox.com";
const API_BASE = `${SERVER_URL}/api`;

if (!TOKEN) {
  process.stderr.write("[agentinbox-mcp] ERROR: AGENTINBOX_TOKEN env var is required\n");
  process.exit(1);
}

// ── REST API helpers ──────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, body: object): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Workspace resolution via token ────────────────────────────────────────────
// The workspace token is different from the JWT auth token.
// We use a dedicated endpoint to validate the workspace token and get tasks.

async function getWorkspaceIdFromToken(): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/agent/workspace`, {
      headers: { "x-workspace-token": TOKEN! },
    });
    if (!res.ok) return null;
    const data = await res.json() as { workspace_id?: string };
    return data.workspace_id ?? null;
  } catch { return null; }
}

// ── MCP tool implementations (call server REST API) ──────────────────────────

async function getPendingTasks(): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/pending`, {
    headers: { "x-workspace-token": TOKEN! },
  });
  if (!res.ok) throw new Error(`get_pending_tasks failed: ${res.status}`);
  return res.json();
}

async function getTask(id: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}`, {
    headers: { "x-workspace-token": TOKEN! },
  });
  if (!res.ok) throw new Error(`get_task failed: ${res.status}`);
  return res.json();
}

async function getFile(taskId: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${taskId}/file`, {
    headers: { "x-workspace-token": TOKEN! },
  });
  if (!res.ok) throw new Error(`get_file failed: ${res.status}`);
  return res.json();
}

async function updateTaskStatus(id: string, status: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN! },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`update_task_status failed: ${res.status}`);
  return res.json();
}

async function completeTask(id: string, summaryTechnical: string, summaryPlain: string, screenshotBase64?: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN! },
    body: JSON.stringify({ summary_technical: summaryTechnical, summary_plain: summaryPlain, screenshot_base64: screenshotBase64 }),
  });
  if (!res.ok) throw new Error(`complete_task failed: ${res.status}`);
  return res.json();
}

async function escalateTask(id: string, reason: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN! },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`escalate_task failed: ${res.status}`);
  return res.json();
}

async function proposePlan(id: string, plan: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN! },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error(`propose_plan failed: ${res.status}`);
  return res.json();
}

async function askDeveloper(id: string, question: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN! },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`ask_developer failed: ${res.status}`);
  return res.json();
}

async function notifyDeveloper(id: string, message: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/agent/tasks/${id}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workspace-token": TOKEN! },
    body: JSON.stringify({ reply: message }),
  });
  if (!res.ok) throw new Error(`notify_developer failed: ${res.status}`);
  return res.json();
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "agentinbox", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: any;
    switch (name) {
      case "get_pending_tasks":  result = await getPendingTasks(); break;
      case "get_task":           result = await getTask(args!.id as string); break;
      case "get_file":           result = await getFile(args!.task_id as string); break;
      case "update_task_status": result = await updateTaskStatus(args!.id as string, args!.status as string); break;
      case "complete_task":      result = await completeTask(args!.id as string, args!.summary_technical as string, args!.summary_plain as string, args!.screenshot_base64 as string | undefined); break;
      case "escalate_task":      result = await escalateTask(args!.id as string, args!.reason as string); break;
      case "propose_plan":       result = await proposePlan(args!.id as string, args!.plan as string); break;
      case "ask_developer":      result = await askDeveloper(args!.id as string, args!.question as string); break;
      case "notify_developer":   result = await notifyDeveloper(args!.id as string, args!.message as string); break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

// ── WebSocket connection (receives task.created events from server) ────────────

function connectSocket(): Socket {
  const socket = SocketClient(SERVER_URL, {
    path: "/agent-socket",
    auth: { token: TOKEN },
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on("connect", () => {
    process.stderr.write(`[agentinbox-mcp] Connected to AgentInbox server\n`);
  });

  socket.on("connected", (data: any) => {
    process.stderr.write(`[agentinbox-mcp] Workspace: ${data.workspace_name} (${data.workspace_id})\n`);
  });

  socket.on("task.created", (payload: any) => {
    process.stderr.write(`[agentinbox-mcp] New task: "${payload.title}" (${payload.task_id})\n`);
    // The MCP tools are now available for Claude to call — Claude will poll
    // get_pending_tasks when it sees this notification via the MCP log stream
  });

  socket.on("connect_error", (err: Error) => {
    process.stderr.write(`[agentinbox-mcp] Connection error: ${err.message}\n`);
  });

  socket.on("disconnect", (reason: string) => {
    process.stderr.write(`[agentinbox-mcp] Disconnected: ${reason} — reconnecting...\n`);
  });

  return socket;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  // Connect WebSocket to receive real-time task events
  connectSocket();

  // Start MCP server over stdio (Claude Code connects here)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[agentinbox-mcp] MCP server ready\n`);
}

main().catch((err) => {
  process.stderr.write(`[agentinbox-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
