"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpTools = void 0;
const zod_1 = require("zod");
const tasks_1 = require("../queue/tasks");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.mcpTools = [
    {
        name: "get_pending_tasks",
        description: "Returns all pending tasks in the inbox that are ready for Claude to work on. Tasks with status 'pending' (and approved if the project requires approval) are returned. Optionally filter by project_id.",
        inputSchema: {
            type: "object",
            properties: {
                project_id: {
                    type: "string",
                    description: "Optional project ID to filter tasks",
                },
            },
        },
        handler(args) {
            const parsed = zod_1.z.object({ project_id: zod_1.z.string().optional() }).parse(args ?? {});
            const tasks = tasks_1.taskQueries.getPendingTasks(parsed.project_id);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(tasks.map((t) => ({
                            id: t.id,
                            project_id: t.project_id,
                            title: t.title,
                            description: t.description,
                            submitter_name: t.submitter_name,
                            has_file: !!t.file_path,
                            file_name: t.file_name,
                            status: t.status,
                            custom_field_values: t.custom_field_values
                                ? JSON.parse(t.custom_field_values)
                                : {},
                            created_at: t.created_at,
                        })), null, 2),
                    },
                ],
            };
        },
    },
    {
        name: "get_task",
        description: "Get full detail for a specific task including parsed file content if any attachment was uploaded.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" },
            },
            required: ["id"],
        },
        handler(args) {
            const { id } = zod_1.z.object({ id: zod_1.z.string() }).parse(args);
            const task = tasks_1.taskQueries.getTask(id);
            if (!task) {
                return {
                    content: [{ type: "text", text: `Task ${id} not found` }],
                    isError: true,
                };
            }
            // Parse custom_field_values so Claude sees structured data, not a JSON string
            const taskOut = {
                ...task,
                custom_field_values: task.custom_field_values
                    ? JSON.parse(task.custom_field_values)
                    : {},
            };
            return {
                content: [{ type: "text", text: JSON.stringify(taskOut, null, 2) }],
            };
        },
    },
    {
        name: "update_task_status",
        description: "Update the status of a task. Use 'in_progress' when you start working, 'failed' if you cannot complete it, 'blocked' if you need more information.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" },
                status: {
                    type: "string",
                    enum: ["in_progress", "failed", "blocked"],
                    description: "New status",
                },
            },
            required: ["id", "status"],
        },
        handler(args) {
            const { id, status } = zod_1.z
                .object({
                id: zod_1.z.string(),
                status: zod_1.z.enum(["in_progress", "failed", "blocked"]),
            })
                .parse(args);
            const task = tasks_1.taskQueries.updateStatus(id, status);
            if (!task) {
                return {
                    content: [{ type: "text", text: `Task ${id} not found` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: "text", text: `Task ${id} updated to status: ${status}` }],
            };
        },
    },
    {
        name: "propose_plan",
        description: "When a project requires PM approval before execution, call this BEFORE starting work. Describe exactly what you plan to do. The task will move to 'awaiting_approval' and the PM will be notified. Do NOT start making changes until you call update_task_status('in_progress') after approval. Check get_task to see if approved_at is set.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" },
                plan: {
                    type: "string",
                    description: "Plain-English plan of what you intend to do: which files, what changes, what tests, what PR strategy.",
                },
            },
            required: ["id", "plan"],
        },
        handler(args) {
            const { id, plan } = zod_1.z
                .object({ id: zod_1.z.string(), plan: zod_1.z.string().min(10) })
                .parse(args);
            const task = tasks_1.taskQueries.proposePlan(id, plan);
            if (!task) {
                return {
                    content: [{ type: "text", text: `Task ${id} not found` }],
                    isError: true,
                };
            }
            // Fire approval email async — import lazily to avoid circular deps
            Promise.resolve().then(() => __importStar(require("../email/mailer"))).then(async ({ sendApprovalRequest }) => {
                const project = tasks_1.taskQueries.getProjectById(task.project_id);
                if (project?.notify_email) {
                    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                    await sendApprovalRequest(project.notify_email, task, project, `${baseUrl}/pm/tasks/${task.id}`).catch(() => { });
                }
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Plan submitted for task ${id}. Status is now 'awaiting_approval'. Poll get_task(id) until approved_at is set, then call update_task_status('in_progress') to proceed.`,
                    },
                ],
            };
        },
    },
    {
        name: "complete_task",
        description: "Mark a task as done and write two completion summaries: a technical one for PMs/devs (include file paths, line numbers, PR links) and a plain-English one for non-technical clients.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" },
                summary_technical: {
                    type: "string",
                    description: "Technical summary for PM/developer: file paths, what changed, PR number, test results",
                },
                summary_plain: {
                    type: "string",
                    description: "Plain English summary for the client — no jargon, no file paths, just what was done and what they should now see",
                },
            },
            required: ["id", "summary_technical", "summary_plain"],
        },
        handler(args) {
            const { id, summary_technical, summary_plain } = zod_1.z
                .object({
                id: zod_1.z.string(),
                summary_technical: zod_1.z.string().min(1),
                summary_plain: zod_1.z.string().min(1),
            })
                .parse(args);
            const task = tasks_1.taskQueries.completeTask(id, summary_technical, summary_plain);
            if (!task) {
                return {
                    content: [{ type: "text", text: `Task ${id} not found` }],
                    isError: true,
                };
            }
            // Fire completion notifications async
            Promise.resolve().then(() => __importStar(require("../email/mailer"))).then(async ({ sendTaskCompleted }) => {
                const project = tasks_1.taskQueries.getProjectById(task.project_id);
                if (project?.notify_email) {
                    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                    await sendTaskCompleted(project.notify_email, task, project, baseUrl).catch(() => { });
                }
            });
            tasks_1.taskQueries.audit({
                project_id: task.project_id,
                task_id: id,
                action: "task_completed",
                detail: `Technical: ${summary_technical}`,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Task ${id} marked as done.\n\nTechnical: ${summary_technical}\n\nPlain English: ${summary_plain}`,
                    },
                ],
            };
        },
    },
    {
        name: "get_file",
        description: "Get the content of any file attached to a task. Returns extracted text for PDFs and Word docs, and the actual image for image files so Claude can see it directly.",
        inputSchema: {
            type: "object",
            properties: {
                task_id: { type: "string", description: "Task ID" },
            },
            required: ["task_id"],
        },
        handler(args) {
            const { task_id } = zod_1.z.object({ task_id: zod_1.z.string() }).parse(args);
            const task = tasks_1.taskQueries.getTask(task_id);
            if (!task) {
                return {
                    content: [{ type: "text", text: `Task ${task_id} not found` }],
                    isError: true,
                };
            }
            if (!task.file_path) {
                return {
                    content: [{ type: "text", text: "No file attached to this task" }],
                };
            }
            const ext = path.extname(task.file_name || "").toLowerCase();
            const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
            if (imageExts.includes(ext)) {
                // Return image as base64 so Claude can see it
                try {
                    const imageBuffer = fs.readFileSync(task.file_path);
                    const base64 = imageBuffer.toString("base64");
                    const mimeMap = {
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".png": "image/png",
                        ".gif": "image/gif",
                        ".webp": "image/webp",
                    };
                    const mimeType = mimeMap[ext] || "image/jpeg";
                    return {
                        content: [
                            {
                                type: "image",
                                data: base64,
                                mimeType,
                            },
                        ],
                    };
                }
                catch {
                    return {
                        content: [{ type: "text", text: `Image file found (${task.file_name}) but could not be read from disk` }],
                        isError: true,
                    };
                }
            }
            // PDF, Word, text — return extracted text
            return {
                content: [
                    {
                        type: "text",
                        text: task.file_content ||
                            `File attached (${task.file_name}) but content not yet parsed`,
                    },
                ],
            };
        },
    },
    {
        name: "escalate_task",
        description: "Escalate a task to a human when you genuinely cannot solve it. The client will see 'Needs human review' and the PM will be notified. Only use this when truly stuck — not as a first resort.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" },
                reason: {
                    type: "string",
                    description: "Honest explanation of why this task cannot be completed autonomously. What was tried, what was missing.",
                },
            },
            required: ["id", "reason"],
        },
        handler(args) {
            const { id, reason } = zod_1.z
                .object({ id: zod_1.z.string(), reason: zod_1.z.string().min(1) })
                .parse(args);
            const task = tasks_1.taskQueries.escalateTask(id, reason);
            if (!task) {
                return {
                    content: [{ type: "text", text: `Task ${id} not found` }],
                    isError: true,
                };
            }
            // Fire escalation email async
            Promise.resolve().then(() => __importStar(require("../email/mailer"))).then(async ({ sendEscalation }) => {
                const project = tasks_1.taskQueries.getProjectById(task.project_id);
                if (project?.notify_email) {
                    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                    await sendEscalation(project.notify_email, task, project, `${baseUrl}/pm/tasks/${task.id}`).catch(() => { });
                }
            });
            tasks_1.taskQueries.audit({
                project_id: task.project_id,
                task_id: id,
                action: "task_escalated",
                detail: reason,
            });
            return {
                content: [
                    { type: "text", text: `Task ${id} escalated.\nReason: ${reason}` },
                ],
            };
        },
    },
];
//# sourceMappingURL=tools.js.map