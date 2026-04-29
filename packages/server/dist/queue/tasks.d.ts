export type TaskStatus = "pending" | "awaiting_approval" | "in_progress" | "done" | "failed" | "blocked" | "escalated";
export interface Task {
    id: string;
    project_id: string;
    title: string;
    description: string;
    status: TaskStatus;
    submitter_name: string | null;
    submitter_email: string | null;
    file_path: string | null;
    file_name: string | null;
    file_content: string | null;
    summary_technical: string | null;
    summary_plain: string | null;
    proposed_plan: string | null;
    approved_at: number | null;
    approved_by: string | null;
    rejected_at: number | null;
    rejected_reason: string | null;
    escalation_reason: string | null;
    slack_ts: string | null;
    custom_field_values: string | null;
    created_at: number;
    updated_at: number;
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
        allowed_emails: string;
        notify_email: string;
        brand_name: string;
        brand_color: string;
        brand_logo_url: string;
        slack_channel: string;
        custom_fields: string;
    }>): Project | undefined;
    deleteProject(id: string): boolean;
    getProjectByToken(token: string): Project | undefined;
    getProjectById(id: string): Project | undefined;
    listProjects(workspaceId: string): Project[];
    createTask(data: {
        project_id: string;
        title: string;
        description: string;
        submitter_name?: string;
        submitter_email?: string;
        file_path?: string;
        file_name?: string;
        file_content?: string;
        custom_field_values?: string;
    }): Task;
    getTask(id: string): Task | undefined;
    getPendingTasks(projectId?: string): Task[];
    getApprovedTasks(projectId?: string): Task[];
    updateStatus(id: string, status: TaskStatus): Task | undefined;
    proposePlan(id: string, plan: string): Task | undefined;
    approveTask(id: string, approvedBy: string): Task | undefined;
    rejectTask(id: string, reason: string): Task | undefined;
    completeTask(id: string, summaryTechnical: string, summaryPlain: string): Task | undefined;
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
};
//# sourceMappingURL=tasks.d.ts.map