import { App } from "@slack/bolt";
export declare function createSlackApp(): App | null;
export declare function postCompletionToSlack(channel: string, task: {
    id: string;
    title: string;
    summary_plain: string | null;
    summary_technical: string | null;
}, projectName: string, baseUrl: string): Promise<void>;
//# sourceMappingURL=bot.d.ts.map