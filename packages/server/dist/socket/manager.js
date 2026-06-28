"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.emitTaskCreated = emitTaskCreated;
exports.emitToPm = emitToPm;
exports.emitChatMessage = emitChatMessage;
exports.getConnectedWorkspaces = getConnectedWorkspaces;
const socket_io_1 = require("socket.io");
const tasks_1 = require("../queue/tasks");
const users_1 = require("../auth/users");
let io = null;
// Only the most-recently connected agent socket per (workspace, project) receives task events.
// This prevents multiple agentinbox-mcp processes (from repeated VS Code sessions, or other
// projects in the same workspace) from all spawning Claude when a single task arrives.
// Key is `${workspaceId}:${projectId}` when the worker advertises a project_id, or just
// `${workspaceId}` for older workers that don't (pre-migration — routes to any project).
const latestAgentSocket = new Map(); // routingKey → socket.id
function routingKey(workspaceId, projectId) {
    return projectId ? `${workspaceId}:${projectId}` : workspaceId;
}
function initSocketServer(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        path: "/agent-socket",
        pingInterval: 10000,
        pingTimeout: 5000,
    });
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token)
            return next(new Error("MISSING_TOKEN"));
        // PM dashboard connects with JWT (Bearer <jwt>)
        if (token.startsWith("Bearer ")) {
            const jwtStr = token.slice(7);
            const payload = (0, users_1.verifyToken)(jwtStr);
            if (!payload?.workspaceId)
                return next(new Error("INVALID_TOKEN"));
            socket.workspaceId = payload.workspaceId;
            socket.socketType = "pm";
            return next();
        }
        // Agent connects with workspace token (wt_xxx), optionally a project_id it's bound to
        const workspace = tasks_1.taskQueries.getWorkspaceByToken(token);
        if (!workspace)
            return next(new Error("INVALID_TOKEN"));
        socket.workspaceId = workspace.id;
        socket.workspaceName = workspace.name;
        socket.socketType = "agent";
        const projectId = socket.handshake.auth.project_id || socket.handshake.query.project_id;
        socket.projectId = projectId || null;
        next();
    });
    io.on("connection", (socket) => {
        const workspaceId = socket.workspaceId;
        const socketType = socket.socketType;
        if (socketType === "pm") {
            socket.join(`pm:${workspaceId}`);
            socket.emit("connected", { type: "pm", workspace_id: workspaceId });
            console.log(`  [socket] PM dashboard connected — workspace: ${workspaceId}`);
            socket.on("disconnect", () => {
                console.log(`  [socket] PM dashboard disconnected — workspace: ${workspaceId}`);
            });
        }
        else {
            const workspaceName = socket.workspaceName;
            const projectId = socket.projectId;
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
function emitTaskCreated(workspaceId, payload) {
    if (!io)
        return;
    const projectId = payload.project_id;
    const projectKey = routingKey(workspaceId, projectId);
    const socketId = latestAgentSocket.get(projectKey) || (projectId ? undefined : latestAgentSocket.get(workspaceId));
    if (socketId) {
        io.to(socketId).emit("task.created", payload);
    }
    else if (!projectId) {
        // No project_id on this task at all — broadcast workspace-wide as before (legacy behavior)
        io.to(`ws:${workspaceId}`).emit("task.created", payload);
    }
    // If projectId is set but no worker is registered for it, we deliberately do NOT
    // fall back to broadcasting to the whole workspace — that would re-introduce the
    // cross-project misrouting this routing key was added to prevent.
}
// PM events
function emitToPm(workspaceId, event, payload) {
    if (!io)
        return;
    io.to(`pm:${workspaceId}`).emit(event, payload);
}
// Chat — send message to worker; worker spawns Claude and emits chat.reply back to PM
function emitChatMessage(workspaceId, payload) {
    if (!io)
        return;
    const socketId = latestAgentSocket.get(workspaceId);
    if (socketId) {
        io.to(socketId).emit("chat.message", payload);
    }
    else {
        io.to(`ws:${workspaceId}`).emit("chat.message", payload);
    }
}
function getConnectedWorkspaces() {
    if (!io)
        return [];
    return [...io.sockets.adapter.rooms.keys()]
        .filter((r) => r.startsWith("ws:"))
        .map((r) => r.slice(3));
}
//# sourceMappingURL=manager.js.map