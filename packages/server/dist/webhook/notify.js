"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fireWebhook = fireWebhook;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
async function fireWebhook(payload) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl)
        return;
    const body = JSON.stringify(payload);
    const parsed = new url_1.URL(webhookUrl);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https_1.default : http_1.default;
    return new Promise((resolve) => {
        const req = lib.request({
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
        }, (res) => {
            res.resume(); // drain response
            resolve();
        });
        req.on("error", () => resolve()); // never throw — webhook is best-effort
        req.setTimeout(5000, () => { req.destroy(); resolve(); });
        req.write(body);
        req.end();
    });
}
//# sourceMappingURL=notify.js.map