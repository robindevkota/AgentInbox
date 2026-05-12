"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.verifyToken = verifyToken;
exports.signupUser = signupUser;
exports.loginUser = loginUser;
exports.getMe = getMe;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require("bcryptjs");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../queue/db");
const { nanoid } = require("nanoid");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-prod";
const JWT_EXPIRY = "30d";
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}
function verifyToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
async function signupUser(email, password, workspaceName) {
    const existing = db_1.db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
        throw new Error("An account with this email already exists");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = nanoid();
    const workspaceId = nanoid();
    db_1.db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(userId, email.toLowerCase(), passwordHash);
    const defaultPlan = process.env.BILLING_ENABLED === "true" ? "free" : "pro";
    db_1.db.prepare("INSERT INTO workspaces (id, name, owner_id, plan) VALUES (?, ?, ?, ?)").run(workspaceId, workspaceName, userId, defaultPlan);
    const token = signToken({ userId, email: email.toLowerCase(), workspaceId });
    return { token, userId, workspaceId };
}
async function loginUser(email, password) {
    const user = db_1.db
        .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
        .get(email.toLowerCase());
    if (!user) {
        throw new Error("Invalid email or password");
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        throw new Error("Invalid email or password");
    }
    const workspace = db_1.db
        .prepare("SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1")
        .get(user.id);
    if (!workspace) {
        throw new Error("No workspace found for this account");
    }
    const token = signToken({ userId: user.id, email: user.email, workspaceId: workspace.id });
    return { token, userId: user.id, workspaceId: workspace.id };
}
function getMe(userId) {
    const user = db_1.db
        .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
        .get(userId);
    if (!user)
        return null;
    const workspace = db_1.db
        .prepare("SELECT id, name, plan, task_count_this_month, plan_expires_at, billing_month FROM workspaces WHERE owner_id = ? LIMIT 1")
        .get(userId);
    return { ...user, workspace: workspace || null };
}
//# sourceMappingURL=users.js.map