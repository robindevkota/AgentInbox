import nodemailer from "nodemailer";
import type { Task, Project } from "../queue/tasks";

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.EMAIL_FROM || "AgentInbox <noreply@agentinbox.io>";

export async function send(to: string, subject: string, html: string) {
  const transport = createTransport();
  if (!transport) return; // silently skip if SMTP not configured
  await transport.sendMail({ from: FROM, to, subject, html });
}

export async function sendOtp(email: string, otp: string, projectName: string) {
  await send(
    email,
    `Your AgentInbox access code for ${projectName}`,
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="margin:0 0 8px">Your one-time access code</h2>
      <p style="color:#64748b;margin:0 0 24px">Enter this code to submit a request to <strong>${projectName}</strong>.</p>
      <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#0284c7;background:#f0f9ff;border-radius:12px;padding:24px;text-align:center">${otp}</div>
      <p style="color:#94a3b8;font-size:13px;margin:24px 0 0">Expires in 10 minutes. Do not share this code.</p>
    </div>
    `
  );
}

export async function sendTaskCompleted(
  to: string,
  task: Task,
  project: Project,
  baseUrl: string
) {
  const statusUrl = `${baseUrl}/task/${task.id}`;
  await send(
    to,
    `✓ Completed: ${task.title} — ${project.name}`,
    `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
      <h2 style="margin:0 0 4px;color:#16a34a">Task completed</h2>
      <p style="color:#64748b;margin:0 0 24px;font-size:14px">${project.name}</p>
      <h3 style="margin:0 0 16px">${task.title}</h3>

      ${task.summary_plain ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:16px">
        <p style="font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">For client</p>
        <p style="margin:0;color:#166534">${task.summary_plain}</p>
      </div>` : ""}

      ${task.summary_technical ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">Technical summary</p>
        <p style="margin:0;color:#334155;font-family:monospace;font-size:13px;white-space:pre-wrap">${task.summary_technical}</p>
      </div>` : ""}

      <a href="${statusUrl}" style="display:inline-block;background:#0284c7;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">View task status →</a>

      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">Task ID: ${task.id}</p>
    </div>
    `
  );
}

export async function sendApprovalRequest(
  to: string,
  task: Task,
  project: Project,
  approvalUrl: string
) {
  await send(
    to,
    `⏳ Approval needed: ${task.title} — ${project.name}`,
    `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
      <h2 style="margin:0 0 4px">Approval needed</h2>
      <p style="color:#64748b;margin:0 0 24px;font-size:14px">${project.name} — Claude has a plan ready</p>
      <h3 style="margin:0 0 16px">${task.title}</h3>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">Proposed plan</p>
        <p style="margin:0;color:#78350f;white-space:pre-wrap">${task.proposed_plan}</p>
      </div>

      <p style="margin:0 0 16px;color:#475569">Review the plan and approve or reject before Claude executes any changes.</p>

      <a href="${approvalUrl}?action=approve" style="display:inline-block;background:#16a34a;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-right:12px">Approve</a>
      <a href="${approvalUrl}?action=reject" style="display:inline-block;background:#dc2626;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Reject</a>
    </div>
    `
  );
}

export async function sendEscalation(
  to: string,
  task: Task,
  project: Project,
  taskUrl: string
) {
  await send(
    to,
    `⚠ Needs human review: ${task.title} — ${project.name}`,
    `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
      <h2 style="margin:0 0 4px;color:#ea580c">Task needs human review</h2>
      <p style="color:#64748b;margin:0 0 24px;font-size:14px">${project.name}</p>
      <h3 style="margin:0 0 16px">${task.title}</h3>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;font-weight:600;color:#c2410c;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">Why Claude escalated</p>
        <p style="margin:0;color:#9a3412">${task.escalation_reason}</p>
      </div>

      <a href="${taskUrl}" style="display:inline-block;background:#0284c7;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">View task →</a>
    </div>
    `
  );
}
