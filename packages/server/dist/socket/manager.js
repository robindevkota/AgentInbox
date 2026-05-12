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
function initSocketServer(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        path: "/agent-socket",
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
function emitTaskCreated(workspaceId, payload) {
    if (!io)
        return;
    io.to(`ws:${workspaceId}`).emit("task.created", payload);
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