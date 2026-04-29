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
export declare function fireWebhook(payload: WebhookPayload): Promise<void>;
//# sourceMappingURL=notify.d.ts.map