"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const routes_1 = require("./api/routes");
const server_1 = require("./mcp/server");
const bot_1 = require("./slack/bot");
const db_1 = require("./queue/db");
const manager_1 = require("./socket/manager");
const fs_1 = __importDefault(require("fs"));
const UI_DIST = fs_1.default.existsSync(path_1.default.join(__dirname, "../ui-dist"))
    ? path_1.default.join(__dirname, "../ui-dist")
    : path_1.default.join(__dirname, "../../ui/dist");
(0, db_1.seedFromEnv)();
function createApp() {
    const app = (0, express_1.default)();
    const server = http_1.default.createServer(app);
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    // MCP endpoint — Claude connects here
    app.post("/mcp", server_1.handleMcpRequest);
    app.get("/mcp", server_1.handleMcpRequest);
    app.delete("/mcp", server_1.handleMcpRequest);
    // REST API
    app.use("/api", (0, routes_1.createRouter)());
    // Slack
    const slackApp = (0, bot_1.createSlackApp)();
    if (slackApp) {
        app.post("/slack/events", async (req, res) => {
            await slackApp.processEvent(req, res);
        });
    }
    // WebSocket server for agentinbox-mcp clients
    (0, manager_1.initSocketServer)(server);
    // Serve UI static files
    app.use(express_1.default.static(UI_DIST));
    app.get("*", (_req, res) => {
        const indexPath = path_1.default.join(UI_DIST, "index.html");
        res.sendFile(indexPath, (err) => {
            if (err)
                res.status(404).send("UI not built yet. Run: pnpm build");
        });
    });
    return { app, server };
}
//# sourceMappingURL=index.js.map