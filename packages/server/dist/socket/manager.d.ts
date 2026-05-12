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
import { Server as SocketServer } from "socket.io";
export declare function initSocketServer(httpServer: HttpServer): SocketServer;
export declare function emitTaskCreated(workspaceId: string, payload: object): void;
export declare function emitToPm(workspaceId: string, event: string, payload: object): void;
export declare function getConnectedWorkspaces(): string[];
//# sourceMappingURL=manager.d.ts.map