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
// JWT auth — always verify Bearer token if present; fall back to API key for self-hosted legacy clients
function requireAuth(req, res, next) {
    const authHeader = req.headers["authorization"];
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
        const payload = (0, users_1.verifyToken)(bearerToken);
        if (!payload) {
            res.status(401).json({ error: "Invalid or expired token" });
            return;
        }
        req.user = payload;
        next();
        return;
    }
    // No Bearer token — fall back to API key for self-hosted / legacy access
    const key = req.headers["x-api-key"] || req.query.api_key;
    const configuredKey = process.env.API_KEY;
    if (!configuredKey || key === configuredKey) {
        next();
        return;
    }
    res.status(401).json({ error: "Authentication required" });
}
//# sourceMappingURL=tokens.js.map