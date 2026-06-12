export type TaskStatus = "pending" | "awaiting_approval" | "in_progress" | "done" | "failed" | "blocked" | "escalated";
export interface Task {
    id: string;
    project_id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: "low" | "medium" | "high";
    submitter_name: string | null;
    submitter_email: string | null;
    file_path: string | null;
    file_name: string | null;
    file_content: string | null;
    file_data: string | null;
    summary_technical: string | null;
    summary_plain: string | null;
    pr_link: string | null;
    screenshot_path: string | null;
    screenshot_base64: string | null;
    proposed_plan: string | null;
    approved_at: number | null;
    approved_by: string | null;
    rejected_at: number | null;
    rejected_reason: string | null;
    escalation_reason: string | null;
    slack_ts: string | null;
    custom_field_values: string | null;
    submitter_notified_at: number | null;
    developer_reply: string | null;
    telegram_message_id: number | null;
    require_verification: number;
    verification_url: string | null;
    created_at: number;
    updated_at: number;
}
export interface TaskComment {
    id: string;
    task_id: string;
    author: string;
    body: string;
    created_at: number;
}
export interface CustomField {
    name: string;
    type: "dropdown" | "text";
    options?: string[];
    required?: boolean;
}
export interface Project {
    id: string;
    workspace_id: string;
    name: string;
    description: string | null;
    token: string;
    require_approval: number;
    require_verification: number;
    allowed_emails: string | null;
    brand_name: string | null;
    brand_color: string | null;
    brand_logo_url: string | null;
    notify_email: string | null;
    slack_channel: string | null;
    custom_fields: string | null;
    created_at: number;
}
export interface Workspace {
    id: string;
    name: string;
    created_at: number;
}
export declare const taskQueries: {
    createWorkspace(name: string): Workspace;
    getWorkspace(id: string): Workspace | undefined;
    createProject(workspaceId: string, name: string, description?: string, options?: {
        require_approval?: boolean;
        require_verification?: boolean;
        allowed_emails?: string;
        notify_email?: string;
        brand_name?: string;
        brand_color?: string;
        slack_channel?: string;
        custom_fields?: string;
    }): Project;
    updateProject(id: string, updates: Partial<{
        name: string;
        description: string;
        require_approval: boolean;
        require_verification: boolean;
        allowed_emails: string;
        notify_email: string;
        brand_name: string;
        brand_color: string;
        brand_logo_url: string;
        slack_channel: string;
        custom_fields: string;
    }>): Project | undefined;
    deleteProject(id: string): boolean;
    deleteTask(id: string): boolean;
    getProjectByToken(token: string): Project | undefined;
    getProjectById(id: string): Project | undefined;
    listProjects(workspaceId: string): Project[];
    createTask(data: {
        project_id: string;
        title: string;
        description: string;
        priority?: "low" | "medium" | "high";
        submitter_name?: string;
        submitter_email?: string;
        file_path?: string;
        file_name?: string;
        file_content?: string;
        file_data?: string;
        custom_field_values?: string;
        require_verification?: boolean;
    }): Task;
    getTask(id: string): Task | undefined;
    getPendingTasks(projectId?: string): Task[];
    getApprovedTasks(projectId?: string): Task[];
    updateStatus(id: string, status: TaskStatus): Task | undefined;
    proposePlan(id: string, plan: string): Task | undefined;
    approveTask(id: string, approvedBy: string): Task | undefined;
    rejectTask(id: string, reason: string): Task | undefined;
    completeTask(id: string, summaryTechnical: string, summaryPlain: string, prLink?: string, screenshotBase64?: string, verificationUrl?: string): {
        task: Task;
        wasAlreadyDone: boolean;
    } | undefined;
    reopenTask(id: string): Task | undefined;
    markSubmitterNotified(id: string): void;
    addComment(taskId: string, author: string, body: string): TaskComment;
    getComments(taskId: string): TaskComment[];
    escalateTask(id: string, reason: string): Task | undefined;
    setSlackTs(id: string, slackTs: string): void;
    listTasks(projectId: string, status?: TaskStatus): Task[];
    createOtp(projectId: string, email: string): string;
    verifyOtp(projectId: string, email: string, token: string): boolean;
    audit(entry: {
        workspace_id?: string;
        project_id?: string;
        task_id?: string;
        action: string;
        actor?: string;
        detail?: string;
    }): void;
    getAuditLog(taskId: string): unknown[];
    getWorkspaceStats(workspaceId: string): {
        total_tasks: number;
        done: number;
        in_progress: number;
        pending: number;
        escalated: number;
        projects: number;
    };
    issueWorkspaceToken(workspaceId: string): string;
    getWorkspaceByToken(token: string): {
        id: string;
        name: string;
        plan: string;
        telegram_bot_token: string | null;
        telegram_chat_id: string | null;
    } | null;
    rotateWorkspaceToken(workspaceId: string): string;
    getWorkspaceToken(workspaceId: string): string | null;
    getTelegramConfig(workspaceId: string): {
        bot_token: string | null;
        chat_id: string | null;
        project_id: string | null;
        screenshot_verification: boolean;
    };
    setTelegramConfig(workspaceId: string, botToken: string | null, chatId: string | null, projectId: string | null, screenshotVerification?: boolean): void;
    getAllWorkspacesWithTelegram(): {
        id: string;
        telegram_bot_token: string;
        telegram_chat_id: string;
        telegram_project_id: string;
    }[];
};
//# sourceMappingURL=tasks.d.ts.map