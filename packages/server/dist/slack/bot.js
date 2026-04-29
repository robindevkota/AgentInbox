"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSlackApp = createSlackApp;
exports.postCompletionToSlack = postCompletionToSlack;
const bolt_1 = require("@slack/bolt");
const tasks_1 = require("../queue/tasks");
let slackApp = null;
function createSlackApp() {
    const token = process.env.SLACK_BOT_TOKEN;
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!token || !signingSecret)
        return null;
    slackApp = new bolt_1.App({
        token,
        signingSecret,
        // Socket mode not used — we mount on Express via middleware
    });
    // /inbox command: submit a task from Slack
    // Usage: /inbox <project-token> | <title> | <description>
    slackApp.command("/inbox", async ({ command, ack, respond }) => {
        await ack();
        const parts = command.text.split("|").map((s) => s.trim());
        if (parts.length < 3) {
            await respond({
                text: "Usage: `/inbox <project-token> | <title> | <description>`",
                response_type: "ephemeral",
            });
            return;
        }
        const [token, title, description] = parts;
        const project = tasks_1.taskQueries.getProjectByToken(token);
        if (!project) {
            await respond({
                text: `Project not found for token: ${token}`,
                response_type: "ephemeral",
            });
            return;
        }
        const task = tasks_1.taskQueries.createTask({
            project_id: project.id,
            title,
            description,
            submitter_name: command.user_name,
        });
        tasks_1.taskQueries.audit({
            project_id: project.id,
            task_id: task.id,
            action: "task_submitted_slack",
            actor: command.user_name,
            detail: `From Slack channel: ${command.channel_name}`,
        });
        await respond({
            text: `✅ Task submitted to *${project.name}*`,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `✅ *Task submitted to ${project.name}*\n*${title}*\n${description}`,
                    },
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: `Task ID: \`${task.id}\` | Status: pending`,
                        },
                    ],
                },
            ],
            response_type: "in_channel",
        });
    });
    // /inbox-status command: check task status
    slackApp.command("/inbox-status", async ({ command, ack, respond }) => {
        await ack();
        const taskId = command.text.trim();
        if (!taskId) {
            await respond({ text: "Usage: `/inbox-status <task-id>`", response_type: "ephemeral" });
            return;
        }
        const task = tasks_1.taskQueries.getTask(taskId);
        if (!task) {
            await respond({ text: `Task not found: ${taskId}`, response_type: "ephemeral" });
            return;
        }
        const statusEmoji = {
            pending: "⏳",
            awaiting_approval: "🔍",
            in_progress: "⚡",
            done: "✅",
            failed: "❌",
            blocked: "⚠️",
            escalated: "👤",
        };
        const emoji = statusEmoji[task.status] || "❓";
        let text = `${emoji} *${task.title}* — ${task.status}`;
        if (task.summary_plain)
            text += `\n\n${task.summary_plain}`;
        await respond({ text, response_type: "ephemeral" });
    });
    return slackApp;
}
async function postCompletionToSlack(channel, task, projectName, baseUrl) {
    if (!slackApp)
        return;
    await slackApp.client.chat.postMessage({
        channel,
        text: `✅ Completed: ${task.title}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        blocks: [
            { type: "header", text: { type: "plain_text", text: `✅ ${task.title}` } },
            { type: "context", elements: [{ type: "mrkdwn", text: `*${projectName}* | Task \`${task.id}\`` }] },
            ...(task.summary_plain ? [{ type: "section", text: { type: "mrkdwn", text: `*For client:*\n${task.summary_plain}` } }] : []),
            ...(task.summary_technical ? [{ type: "section", text: { type: "mrkdwn", text: `*Technical:*\n\`\`\`${task.summary_technical}\`\`\`` } }] : []),
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View status" }, url: `${baseUrl}/task/${task.id}` }] },
        ],
    });
}
//# sourceMappingURL=bot.js.map