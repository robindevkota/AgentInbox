"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerClaude = triggerClaude;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const SCRIPT = path_1.default.resolve(__dirname, "../../../../trigger-claude.ps1");
let triggering = false;
function triggerClaude() {
    if (triggering)
        return; // debounce — only one trigger at a time
    triggering = true;
    const proc = (0, child_process_1.spawn)("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", SCRIPT], {
        detached: true,
        stdio: "ignore",
    });
    proc.unref(); // don't block server process
    // Reset after 5 seconds so next task can trigger again
    setTimeout(() => { triggering = false; }, 5000);
    console.log("[trigger] Claude trigger fired");
}
//# sourceMappingURL=claude.js.map