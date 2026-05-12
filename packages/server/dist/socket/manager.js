"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.emitTaskCreated = emitTaskCreated;
exports.getConnectedWorkspaces = getConnectedWorkspaces;
const socket_io_1 = require("socket.io");
const tasks_1 = require("../queue/tasks");
let io = null;
function initSocketServer(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        path: "/agent-socket",
    });
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) {
            return next(new Error("MISSING_TOKEN"));
        }
        const workspace = tasks_1.taskQueries.getWorkspaceByToken(token);
        if (!workspace) {
            return next(new Error("INVALID_TOKEN"));
        }
        socket.workspaceId = workspace.id;
        socket.workspaceName = workspace.name;
        next();
    });
    io.on("connection", (socket) => {
        const workspaceId = socket.workspaceId;
        const workspaceName = socket.workspaceName;
        socket.join(`ws:${workspaceId}`);
        console.log(`  [socket] agent connected — workspace: ${workspaceName} (${workspaceId})`);
        socket.emit("connected", { workspace_id: workspaceId, workspace_name: workspaceName });
        socket.on("disconnect", (reason) => {
            console.log(`  [socket] agent disconnected — workspace: ${workspaceName} (${reason})`);
        });
    });
    return io;
}
function emitTaskCreated(workspaceId, payload) {
    if (!io)
        return;
    io.to(`ws:${workspaceId}`).emit("task.created", payload);
}
function getConnectedWorkspaces() {
    if (!io)
        return [];
    return [...io.sockets.adapter.rooms.keys()]
        .filter((r) => r.startsWith("ws:"))
        .map((r) => r.slice(3));
}
//# sourceMappingURL=manager.js.map