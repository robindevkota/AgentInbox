"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMcpRequest = handleMcpRequest;
exports.runStdioMcp = runStdioMcp;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_1 = require("./tools");
function buildServer() {
    const server = new index_js_1.Server({ name: "agentinbox", version: "0.1.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
        tools: tools_1.mcpTools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        })),
    }));
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const tool = tools_1.mcpTools.find((t) => t.name === request.params.name);
        if (!tool) {
            return {
                content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
                isError: true,
            };
        }
        try {
            return tool.handler(request.params.arguments);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            };
        }
    });
    return server;
}
// HTTP handler — one stateless transport per request (simplest for self-hosted)
async function handleMcpRequest(req, res) {
    const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
    });
    const server = buildServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
}
// Stdio mode for running as a standalone MCP server process
async function runStdioMcp() {
    const server = buildServer();
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
//# sourceMappingURL=server.js.map