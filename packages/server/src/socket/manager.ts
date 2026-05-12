/**
 * socket/manager.ts — WebSocket server for two client types:
 *
 * 1. agentinbox-mcp (agent) — connects with workspace token (wt_xxx)
 *    Room: ws:<workspaceId>
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

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/agent-socket",
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

    // Agent connects with workspace token (wt_xxx)
    const workspace = taskQueries.getWorkspaceByToken(token);
    if (!workspace) return next(new Error("INVALID_TOKEN"));
    (socket as any).workspaceId = workspace.id;
    (socket as any).workspaceName = workspace.name;
    (socket as any).socketType = "agent";
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
      socket.join(`ws:${workspaceId}`);
      socket.emit("connected", { type: "agent", workspace_id: workspaceId, workspace_name: workspaceName });
      console.log(`  [socket] agent connected — workspace: ${workspaceName} (${workspaceId})`);
      socket.on("disconnect", (reason) => {
        console.log(`  [socket] agent disconnected — workspace: ${workspaceName} (${reason})`);
      });
    }
  });

  return io;
}

// Agent events
export function emitTaskCreated(workspaceId: string, payload: object): void {
  if (!io) return;
  io.to(`ws:${workspaceId}`).emit("task.created", payload);
}

// PM events
export function emitToPm(workspaceId: string, event: string, payload: object): void {
  if (!io) return;
  io.to(`pm:${workspaceId}`).emit(event, payload);
}

export function getConnectedWorkspaces(): string[] {
  if (!io) return [];
  return [...io.sockets.adapter.rooms.keys()]
    .filter((r) => r.startsWith("ws:"))
    .map((r) => r.slice(3));
}
