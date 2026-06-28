/**
 * socket/manager.ts — WebSocket server for two client types:
 *
 * 1. agentinbox-mcp (agent) — connects with workspace token (wt_xxx) + optional project_id
 *    Room: ws:<workspaceId>, plus ws:<workspaceId>:<projectId> when project_id is provided
 *    Events received: task.created
 *
 * 2. PM Dashboard (browser) — connects with JWT bearer token
 *    Room: pm:<workspaceId>
 *    Events received: task.submitted, task.done, task.escalated, task.approval_needed
 */

import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { taskQueries } from "../queue/tasks";
import { verifyToken } from "../auth/users";

let io: SocketServer | null = null;

// Only the most-recently connected agent socket per (workspace, project) receives task events.
// This prevents multiple agentinbox-mcp processes (from repeated VS Code sessions, or other
// projects in the same workspace) from all spawning Claude when a single task arrives.
// Key is `${workspaceId}:${projectId}` when the worker advertises a project_id, or just
// `${workspaceId}` for older workers that don't (pre-migration — routes to any project).
const latestAgentSocket = new Map<string, string>(); // routingKey → socket.id

function routingKey(workspaceId: string, projectId?: string | null): string {
  return projectId ? `${workspaceId}:${projectId}` : workspaceId;
}

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/agent-socket",
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token as string;
    if (!token) return next(new Error("MISSING_TOKEN"));

    // PM dashboard connects with JWT (Bearer <jwt>)
    if (token.startsWith("Bearer ")) {
      const jwtStr = token.slice(7);
      const payload = verifyToken(jwtStr);
      if (!payload?.workspaceId) return next(new Error("INVALID_TOKEN"));
      (socket as any).workspaceId = payload.workspaceId;
      (socket as any).socketType = "pm";
      return next();
    }

    // Agent connects with workspace token (wt_xxx), optionally a project_id it's bound to
    const workspace = taskQueries.getWorkspaceByToken(token);
    if (!workspace) return next(new Error("INVALID_TOKEN"));
    (socket as any).workspaceId = workspace.id;
    (socket as any).workspaceName = workspace.name;
    (socket as any).socketType = "agent";
    const projectId = socket.handshake.auth.project_id || socket.handshake.query.project_id as string | undefined;
    (socket as any).projectId = projectId || null;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const workspaceId = (socket as any).workspaceId as string;
    const socketType = (socket as any).socketType as string;

    if (socketType === "pm") {
      socket.join(`pm:${workspaceId}`);
      socket.emit("connected", { type: "pm", workspace_id: workspaceId });
      console.log(`  [socket] PM dashboard connected — workspace: ${workspaceId}`);
      socket.on("disconnect", () => {
        console.log(`  [socket] PM dashboard disconnected — workspace: ${workspaceId}`);
      });
    } else {
      const workspaceName = (socket as any).workspaceName as string;
      const projectId = (socket as any).projectId as string | null;
      const key = routingKey(workspaceId, projectId);
      socket.join(`ws:${workspaceId}`);
      latestAgentSocket.set(key, socket.id);
      socket.emit("connected", { type: "agent", workspace_id: workspaceId, workspace_name: workspaceName, project_id: projectId });
      console.log(`  [socket] agent connected — workspace: ${workspaceName} (${workspaceId}) project: ${projectId || "(none — legacy worker)"} socket: ${socket.id}`);
      socket.on("disconnect", (reason) => {
        console.log(`  [socket] agent disconnected — workspace: ${workspaceName} project: ${projectId || "(none)"} (${reason})`);
        if (latestAgentSocket.get(key) === socket.id) {
          latestAgentSocket.delete(key);
        }
      });
    }
  });

  return io;
}

// Agent events — emit only to the latest connected agent socket for this specific project,
// so a workspace with multiple projects routes each task to the correct worker. Falls back
// to the workspace-wide socket only when no project-specific worker is registered (e.g. a
// pre-migration worker that never advertised a project_id).
export function emitTaskCreated(workspaceId: string, payload: { project_id?: string; [key: string]: unknown }): void {
  if (!io) return;
  const projectId = (payload as any).project_id as string | undefined;
  const projectKey = routingKey(workspaceId, projectId);
  const socketId = latestAgentSocket.get(projectKey) || (projectId ? undefined : latestAgentSocket.get(workspaceId));
  if (socketId) {
    io.to(socketId).emit("task.created", payload);
  } else if (!projectId) {
    // No project_id on this task at all — broadcast workspace-wide as before (legacy behavior)
    io.to(`ws:${workspaceId}`).emit("task.created", payload);
  }
  // If projectId is set but no worker is registered for it, we deliberately do NOT
  // fall back to broadcasting to the whole workspace — that would re-introduce the
  // cross-project misrouting this routing key was added to prevent.
}

// PM events
export function emitToPm(workspaceId: string, event: string, payload: object): void {
  if (!io) return;
  io.to(`pm:${workspaceId}`).emit(event, payload);
}

// Chat — send message to worker; worker spawns Claude and emits chat.reply back to PM
export function emitChatMessage(workspaceId: string, payload: { sessionId: string; userMsgId: string; prompt: string }): void {
  if (!io) return;
  const socketId = latestAgentSocket.get(workspaceId);
  if (socketId) {
    io.to(socketId).emit("chat.message", payload);
  } else {
    io.to(`ws:${workspaceId}`).emit("chat.message", payload);
  }
}

export function getConnectedWorkspaces(): string[] {
  if (!io) return [];
  return [...io.sockets.adapter.rooms.keys()]
    .filter((r) => r.startsWith("ws:"))
    .map((r) => r.slice(3));
}
