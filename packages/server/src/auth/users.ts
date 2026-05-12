// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require("bcryptjs") as typeof import("bcryptjs");
import jwt from "jsonwebtoken";
import { db, nowUnix } from "../queue/db";

const { nanoid } = require("nanoid");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-prod";
const JWT_EXPIRY = "30d";

export interface UserPayload {
  userId: string;
  email: string;
  workspaceId: string;
}

export function signToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch {
    return null;
  }
}

export async function signupUser(email: string, password: string, workspaceName: string) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = nanoid();
  const workspaceId = nanoid();

  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(
    userId,
    email.toLowerCase(),
    passwordHash
  );

  const defaultPlan = process.env.BILLING_ENABLED === "true" ? "free" : "pro";
  db.prepare(
    "INSERT INTO workspaces (id, name, owner_id, plan) VALUES (?, ?, ?, ?)"
  ).run(workspaceId, workspaceName, userId, defaultPlan);

  const token = signToken({ userId, email: email.toLowerCase(), workspaceId });
  return { token, userId, workspaceId };
}

export async function loginUser(email: string, password: string) {
  const user = db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(email.toLowerCase()) as { id: string; email: string; password_hash: string } | undefined;

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  const workspace = db
    .prepare("SELECT id FROM workspaces WHERE owner_id = ? LIMIT 1")
    .get(user.id) as { id: string } | undefined;

  if (!workspace) {
    throw new Error("No workspace found for this account");
  }

  const token = signToken({ userId: user.id, email: user.email, workspaceId: workspace.id });
  return { token, userId: user.id, workspaceId: workspace.id };
}

export function getMe(userId: string) {
  const user = db
    .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
    .get(userId) as { id: string; email: string; created_at: number } | undefined;

  if (!user) return null;

  const workspace = db
    .prepare("SELECT id, name, plan, task_count_this_month, plan_expires_at, billing_month FROM workspaces WHERE owner_id = ? LIMIT 1")
    .get(userId) as {
      id: string;
      name: string;
      plan: string;
      task_count_this_month: number;
      plan_expires_at: number | null;
      billing_month: string | null;
    } | undefined;

  return { ...user, workspace: workspace || null };
}
