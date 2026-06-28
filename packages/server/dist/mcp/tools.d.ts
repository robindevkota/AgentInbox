export declare const mcpTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            project_id: {
                type: string;
                description: string;
            };
            id?: undefined;
            status?: undefined;
            summary_technical?: undefined;
            summary_plain?: undefined;
            pr_link?: undefined;
            screenshot_base64?: undefined;
            task_id?: undefined;
            title?: undefined;
            description?: undefined;
            priority?: undefined;
            reason?: undefined;
        };
        required?: undefined;
    };
    handler(args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            id: {
                type: string;
                description: string;
            };
            project_id?: undefined;
            status?: undefined;
            summary_technical?: undefined;
            summary_plain?: undefined;
            pr_link?: undefined;
            screenshot_base64?: undefined;
            task_id?: undefined;
            title?: undefined;
            description?: undefined;
            priority?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
    handler(args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
        isError: boolean;
    } | {
        content: {
            type: string;
            text: string;
        }[];
        isError?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            id: {
                type: string;
                description: string;
            };
            status: {
                type: string;
                enum: string[];
                description: string;
            };
            project_id?: undefined;
            summary_technical?: undefined;
            summary_plain?: undefined;
            pr_link?: undefined;
            screenshot_base64?: undefined;
            task_id?: undefined;
            title?: undefined;
            description?: undefined;
            priority?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
    handler(args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
        isError: boolean;
    } | {
        content: {
            type: string;
            text: string;
        }[];
        isError?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            id: {
                type: string;
                description: string;
            };
            summary_technical: {
                type: string;
                description: string;
            };
            summary_plain: {
                type: string;
                description: string;
            };
            pr_link: {
                type: string;
                description: string;
            };
            screenshot_base64: {
                type: string;
                description: string;
            };
            project_id?: undefined;
            status?: undefined;
            task_id?: undefined;
            title?: undefined;
            description?: undefined;
            priority?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
    handler(args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
        isError: boolean;
    } | {
        content: {
            type: string;
            text: string;
        }[];
        isError?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            task_id: {
                type: string;
                description: string;
            };
            project_id?: undefined;
            id?: undefined;
            status?: undefined;
            summary_technical?: undefined;
            summary_plain?: undefined;
            pr_link?: undefined;
            screenshot_base64?: undefined;
            title?: undefined;
            description?: undefined;
            priority?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
    handler(args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
        isError: boolean;
    } | {
        content: {
            type: string;
            text: string;
        }[];
        isError?: undefined;
    } | {
        content: {
            type: string;
            data: string;
            mimeType: string;
        }[];
        isError?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            project_id?: undefined;
            id?: undefined;
            status?: undefined;
            summary_technical?: undefined;
            summary_plain?: undefined;
            pr_link?: undefined;
            screenshot_base64?: undefined;
            task_id?: undefined;
            title?: undefined;
            description?: undefined;
            priority?: undefined;
            reason?: undefined;
        };
        required?: undefined;
    };
    handler(_args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            project_id: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            priority: {
                type: string;
                enum: string[];
                description: string;
            };
            id?: undefined;
            status?: undefined;
            summary_technical?: undefined;
            summary_plain?: undefined;
            pr_link?: undefined;
            screenshot_base64?: undefined;
            task_id?: undefined;
            reason?: undefined;
        };
        required: string[];
    };
    handler(args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
        isError: boolean;
    } | {
        content: {
            type: string;
            text: string;
        }[];
        isError?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            id: {
                type: string;
                description: string;
            };
            reason: {
                type: string;
                description: string;
            };
            project_id?: undefined;
            status?: undefined;
            summary_technical?: undefined;
            summary_plain?: undefined;
            pr_link?: undefined;
            screenshot_base64?: undefined;
            task_id?: undefined;
            title?: undefined;
            description?: undefined;
            priority?: undefined;
        };
        required: string[];
    };
    handler(args: unknown): {
        content: {
            type: string;
            text: string;
        }[];
        isError: boolean;
    } | {
        content: {
            type: string;
            text: string;
        }[];
        isError?: undefined;
    };
})[];
//# sourceMappingURL=tools.d.ts.map