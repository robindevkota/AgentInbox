import type { Task, Project } from "../queue/tasks";
export declare function send(to: string, subject: string, html: string): Promise<void>;
export declare function sendOtp(email: string, otp: string, projectName: string): Promise<void>;
export declare function sendTaskCompleted(to: string, task: Task, project: Project, baseUrl: string): Promise<void>;
export declare function sendApprovalRequest(to: string, task: Task, project: Project, approvalUrl: string): Promise<void>;
export declare function sendEscalation(to: string, task: Task, project: Project, taskUrl: string): Promise<void>;
//# sourceMappingURL=mailer.d.ts.map