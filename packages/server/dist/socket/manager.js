"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.emitTaskCreated = emitTaskCreated;
exports.emitToPm = emitToPm;
exports.getConnectedWorkspaces = getConnectedWorkspaces;
const socket_io_1 = require("socket.io");
const tasks_1 = require("../queue/tasks");
const users_1 = require("../auth/users");
let io = null;
// Only the most-recently connected agent socket per workspace receives task events.
// This prevents multiple agentinbox-mcp processes (from repeated VS Code sessions)
// from all spawning Claude when a single task arrives.
const latestAgentSocket = new Map(); // workspaceId → socket.id
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
        // Agent connects with workspace token (wt_xxx)
        const workspace = tasks_1.taskQueries.getWorkspaceByToken(token);
        if (!workspace)
            return next(new Error("INVALID_TOKEN"));
        socket.workspaceId = workspace.id;
        socket.workspaceName = workspace.name;
        socket.socketType = "agent";
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
            socket.join(`ws:${workspaceId}`);
            latestAgentSocket.set(workspaceId, socket.id);
            socket.emit("connected", { type: "agent", workspace_id: workspaceId, workspace_name: workspaceName });
            console.log(`  [socket] agent connected — workspace: ${workspaceName} (${workspaceId}) socket: ${socket.id}`);
            socket.on("disconnect", (reason) => {
                console.log(`  [socket] agent disconnected — workspace: ${workspaceName} (${reason})`);
                if (latestAgentSocket.get(workspaceId) === socket.id) {
                    latestAgentSocket.delete(workspaceId);
                }
            });
        }
    });
    return io;
}
// Agent events — emit only to the latest connected agent socket to prevent
// multiple agentinbox-mcp instances from each spawning Claude for the same task.
function emitTaskCreated(workspaceId, payload) {
    if (!io)
        return;
    const socketId = latestAgentSocket.get(workspaceId);
    if (socketId) {
        io.to(socketId).emit("task.created", payload);
    }
    else {
        io.to(`ws:${workspaceId}`).emit("task.created", payload);
    }
}
// PM events
function emitToPm(workspaceId, event, payload) {
    if (!io)
        return;
    io.to(`pm:${workspaceId}`).emit(event, payload);
}
function getConnectedWorkspaces() {
    if (!io)
        return [];
    return [...io.sockets.adapter.rooms.keys()]
        .filter((r) => r.startsWith("ws:"))
        .map((r) => r.slice(3));
}
//# sourceMappingURL=manager.js.map