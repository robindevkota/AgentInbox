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
import { Server as SocketServer } from "socket.io";
export declare function initSocketServer(httpServer: HttpServer): SocketServer;
export declare function emitTaskCreated(workspaceId: string, payload: object): void;
export declare function getConnectedWorkspaces(): string[];
//# sourceMappingURL=manager.d.ts.map