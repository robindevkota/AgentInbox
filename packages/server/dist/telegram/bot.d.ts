export declare function sendTelegramToWorkspace(workspaceId: string, text: string, replyToMessageId?: number): Promise<number | null>;
export declare function sendTelegram(text: string, replyToMessageId?: number): Promise<number | null>;
export declare function refreshPollerForWorkspace(workspaceId: string): void;
export declare function startTelegramPolling(): void;
export declare function stopTelegramPolling(): void;
export declare function notifyTaskSubmitted(taskId: string, title: string, projectName: string): Promise<void>;
export declare function notifyTaskDone(taskId: string, title: string): Promise<void>;
export declare function notifyTaskEscalated(taskId: string, title: string, reason: string): Promise<void>;
export declare function notifyApprovalNeeded(taskId: string, title: string, plan: string): Promise<void>;
export declare function askDeveloper(taskId: string, title: string, question: string): Promise<void>;
//# sourceMappingURL=bot.d.ts.map