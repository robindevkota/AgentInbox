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
const routes_1 = require("./api/routes");
const server_1 = require("./mcp/server");
const bot_1 = require("./slack/bot");
const fs_1 = __importDefault(require("fs"));
// npm package: ui-dist/ sits alongside dist/ inside the package root
// monorepo dev: fall back to packages/ui/dist (Vite output)
const UI_DIST = fs_1.default.existsSync(path_1.default.join(__dirname, "../ui-dist"))
    ? path_1.default.join(__dirname, "../ui-dist")
    : path_1.default.join(__dirname, "../../ui/dist");
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    // MCP endpoint — Claude connects here
    app.post("/mcp", server_1.handleMcpRequest);
    app.get("/mcp", server_1.handleMcpRequest);
    app.delete("/mcp", server_1.handleMcpRequest);
    // REST API
    app.use("/api", (0, routes_1.createRouter)());
    // Slack — mount Bolt middleware if configured
    const slackApp = (0, bot_1.createSlackApp)();
    if (slackApp) {
        // Use Bolt's built-in Express receiver for /slack/events
        app.post("/slack/events", async (req, res) => {
            // Bolt handles verification and event routing
            await slackApp.processEvent(req, res);
        });
    }
    // Serve UI static files in production
    app.use(express_1.default.static(UI_DIST));
    app.get("*", (_req, res) => {
        const indexPath = path_1.default.join(UI_DIST, "index.html");
        res.sendFile(indexPath, (err) => {
            if (err)
                res.status(404).send("UI not built yet. Run: pnpm build");
        });
    });
    return app;
}
//# sourceMappingURL=index.js.map