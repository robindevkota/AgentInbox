import https from "https";
import http from "http";
import { URL } from "url";

export interface WebhookPayload {
  event: "task.created";
  task_id: string;
  project_id: string;
  project_name: string;
  project_token: string;
  title: string;
  description: string;
  submitter_name: string | null | undefined;
  has_file: boolean;
}

export async function fireWebhook(payload: WebhookPayload): Promise<void> {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return;

  const body = JSON.stringify(payload);
  const parsed = new URL(webhookUrl);
  const isHttps = parsed.protocol === "https:";
  const lib = isHttps ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "AgentInbox-Webhook/1.0",
          // Optional shared secret for verification
          ...(process.env.WEBHOOK_SECRET
            ? { "X-AgentInbox-Secret": process.env.WEBHOOK_SECRET }
            : {}),
        },
      },
      (res) => {
        res.resume(); // drain response
        resolve();
      }
    );
    req.on("error", () => resolve()); // never throw — webhook is best-effort
    req.setTimeout(5000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}
