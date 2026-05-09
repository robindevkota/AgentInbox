"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProjectToken = requireProjectToken;
exports.requireApiKey = requireApiKey;
exports.requireAuth = requireAuth;
const tasks_1 = require("../queue/tasks");
const users_1 = require("./users");
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
// JWT auth when BILLING_ENABLED=true, otherwise falls back to API key behavior
function requireAuth(req, res, next) {
    if (process.env.BILLING_ENABLED !== "true") {
        // Self-hosted / legacy: use API key gate (allow all if no key configured)
        const key = req.headers["x-api-key"] || req.query.api_key;
        const configuredKey = process.env.API_KEY;
        if (!configuredKey || key === configuredKey) {
            next();
            return;
        }
        res.status(401).json({ error: "Invalid API key" });
        return;
    }
    const authHeader = req.headers["authorization"];
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: "Authentication required" });
        return;
    }
    const payload = (0, users_1.verifyToken)(token);
    if (!payload) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
    }
    req.user = payload;
    next();
}
//# sourceMappingURL=tokens.js.map