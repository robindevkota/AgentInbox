export interface UserPayload {
    userId: string;
    email: string;
    workspaceId: string;
}
export declare function signToken(payload: UserPayload): string;
export declare function verifyToken(token: string): UserPayload | null;
export declare function signupUser(email: string, password: string, workspaceName: string): Promise<{
    token: string;
    userId: any;
    workspaceId: any;
}>;
export declare function loginUser(email: string, password: string): Promise<{
    token: string;
    userId: string;
    workspaceId: string;
}>;
export declare function getMe(userId: string): {
    workspace: {
        id: string;
        name: string;
        plan: string;
        task_count_this_month: number;
        plan_expires_at: number | null;
        billing_month: string | null;
    } | null;
    id: string;
    email: string;
    created_at: number;
} | null;
//# sourceMappingURL=users.d.ts.map