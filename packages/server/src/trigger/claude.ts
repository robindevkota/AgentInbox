import { spawn } from "child_process";
import path from "path";

const SCRIPT = path.resolve(__dirname, "../../../../trigger-claude.ps1");
let triggering = false;

export function triggerClaude(): void {
  if (triggering) return; // debounce — only one trigger at a time
  triggering = true;

  const proc = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", SCRIPT], {
    detached: true,
    stdio: "ignore",
  });

  proc.unref(); // don't block server process

  // Reset after 5 seconds so next task can trigger again
  setTimeout(() => { triggering = false; }, 5000);

  console.log("[trigger] Claude trigger fired");
}
