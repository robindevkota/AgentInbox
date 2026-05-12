/**
 * socket/manager.ts — WebSocket server for agentinbox-mcp clients.
 *
 * Flow:
 *   1. agentinbox-mcp connects with ?token=wt_xxx
 *   2. Server validates token → looks up workspace
 *   3. Socket joins room `ws:<workspaceId>`
 *   4. On task.created → server emits to that room
 *   5. Client receives event, spawns Claude, processes task
 */

import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { taskQueries } from "../queue/tasks";

let io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/agent-socket",
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token as string;
    if (!token) {
      return next(new Error("MISSING_TOKEN"));
    }
    const workspace = taskQueries.getWorkspaceByToken(token);
    if (!workspace) {
      return next(new Error("INVALID_TOKEN"));
    }
    (socket as any).workspaceId = workspace.id;
    (socket as any).workspaceName = workspace.name;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const workspaceId = (socket as any).workspaceId as string;
    const workspaceName = (socket as any).workspaceName as string;

    socket.join(`ws:${workspaceId}`);
    console.log(`  [socket] agent connected — workspace: ${workspaceName} (${workspaceId})`);

    socket.emit("connected", { workspace_id: workspaceId, workspace_name: workspaceName });

    socket.on("disconnect", (reason) => {
      console.log(`  [socket] agent disconnected — workspace: ${workspaceName} (${reason})`);
    });
  });

  return io;
}

export function emitTaskCreated(workspaceId: string, payload: object): void {
  if (!io) return;
  io.to(`ws:${workspaceId}`).emit("task.created", payload);
}

export function getConnectedWorkspaces(): string[] {
  if (!io) return [];
  return [...io.sockets.adapter.rooms.keys()]
    .filter((r) => r.startsWith("ws:"))
    .map((r) => r.slice(3));
}
