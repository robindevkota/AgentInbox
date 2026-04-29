"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProjectToken = requireProjectToken;
exports.requireApiKey = requireApiKey;
const tasks_1 = require("../queue/tasks");
function requireProjectToken(req, res, next) {
    const token = req.params.token || req.query.token;
    if (!token) {
        res.status(401).json({ error: "Project token required" });
        return;
    }
    const project = tasks_1.taskQueries.getProjectByToken(token);
    if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
    }
    req.project = project;
    next();
}
// Simple API key auth for PM dashboard and MCP access
function requireApiKey(req, res, next) {
    const key = req.headers["x-api-key"] || req.query.api_key;
    const configuredKey = process.env.API_KEY;
    // If no API_KEY set, allow all (self-hosted default)
    if (!configuredKey) {
        next();
        return;
    }
    if (key !== configuredKey) {
        res.status(401).json({ error: "Invalid API key" });
        return;
    }
    next();
}
//# sourceMappingURL=tokens.js.map