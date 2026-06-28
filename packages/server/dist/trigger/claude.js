"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerClaude = triggerClaude;
const child_process_1 = require("child_process");
const CLAUDE = "C:\\Users\\user\\.local\\bin\\claude";
const PROJECT = "C:\\Users\\user\\Desktop\\Projects\\AgentInbox";
function triggerClaude() {
    const proc = (0, child_process_1.spawn)(CLAUDE, ["--dangerously-skip-permissions", "--print", "check pending tasks"], {
        cwd: PROJECT,
        detached: true,
        stdio: "ignore",
        shell: false,
    });
    proc.unref();
    console.log("[trigger] Claude spawned");
}
//# sourceMappingURL=claude.js.map