import { z } from "zod";
import { taskQueries } from "../queue/tasks";

export const mcpTools = [
  {
    name: "get_pending_tasks",
    description:
      "Returns all pending tasks in the inbox. Claude should call this to check for new work. Optionally filter by project_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Optional project ID to filter tasks",
        },
      },
    },
    handler(args: unknown) {
      const parsed = z.object({ project_id: z.string().optional() }).parse(args ?? {});
      const tasks = taskQueries.getPendingTasks(parsed.project_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              tasks.map((t) => ({
                id: t.id,
                project_id: t.project_id,
                title: t.title,
                description: t.description,
                submitter_name: t.submitter_name,
                has_file: !!t.file_path,
                file_name: t.file_name,
                created_at: t.created_at,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_task",
    description:
      "Get full detail for a specific task including parsed file content if any attachment was uploaded.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Task ID" },
      },
      required: ["id"],
    },
    handler(args: unknown) {
      const { id } = z.object({ id: z.string() }).parse(args);
      const task = taskQueries.getTask(id);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task ${id} not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
      };
    },
  },

  {
    name: "update_task_status",
    description:
      "Update the status of a task. Use 'in_progress' when you start working, 'failed' if you cannot complete it, 'blocked' if you need more information.",
    inputSchema: {
      type: "object" as const,
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
    handler(args: unknown) {
      const { id, status } = z
        .object({
          id: z.string(),
          status: z.enum(["in_progress", "failed", "blocked"]),
        })
        .parse(args);
      const task = taskQueries.updateStatus(id, status);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task ${id} not found` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Task ${id} updated to status: ${status}`,
          },
        ],
      };
    },
  },

  {
    name: "complete_task",
    description:
      "Mark a task as done and write two completion summaries: a technical one for PMs/devs (include file paths, line numbers, PR links) and a plain-English one for non-technical clients.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Task ID" },
        summary_technical: {
          type: "string",
          description:
            "Technical summary for PM/developer: file paths, what changed, PR number, test results",
        },
        summary_plain: {
          type: "string",
          description:
            "Plain English summary for the client — no jargon, no file paths, just what was done and what they should now see",
        },
      },
      required: ["id", "summary_technical", "summary_plain"],
    },
    handler(args: unknown) {
      const { id, summary_technical, summary_plain } = z
        .object({
          id: z.string(),
          summary_technical: z.string().min(1),
          summary_plain: z.string().min(1),
        })
        .parse(args);
      const task = taskQueries.completeTask(id, summary_technical, summary_plain);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task ${id} not found` }],
          isError: true,
        };
      }
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
    description:
      "Get the parsed text content of any file attached to a task. Returns extracted text from PDFs, Word docs, plain text files, or a description for images.",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
      },
      required: ["task_id"],
    },
    handler(args: unknown) {
      const { task_id } = z.object({ task_id: z.string() }).parse(args);
      const task = taskQueries.getTask(task_id);
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
      return {
        content: [
          {
            type: "text",
            text: task.file_content || `File attached (${task.file_name}) but content not yet parsed`,
          },
        ],
      };
    },
  },

  {
    name: "escalate_task",
    description:
      "Escalate a task to a human when you genuinely cannot solve it. The client will see 'Needs human review' and the PM will see your reason. Only use this when truly stuck — not as a first resort.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Task ID" },
        reason: {
          type: "string",
          description:
            "Honest explanation of why this task cannot be completed autonomously. What was tried, what was missing.",
        },
      },
      required: ["id", "reason"],
    },
    handler(args: unknown) {
      const { id, reason } = z
        .object({ id: z.string(), reason: z.string().min(1) })
        .parse(args);
      const task = taskQueries.escalateTask(id, reason);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task ${id} not found` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Task ${id} escalated.\nReason: ${reason}`,
          },
        ],
      };
    },
  },
];
