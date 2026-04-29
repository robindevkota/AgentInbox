#!/usr/bin/env node
// Copies packages/ui/dist → packages/server/ui-dist so it's included in the npm package
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "../../ui/dist");
const dest = path.join(__dirname, "../ui-dist");

if (!fs.existsSync(src)) {
  console.error(`UI dist not found at ${src} — run pnpm build in packages/ui first`);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`✓ Copied UI dist → ui-dist/ (${fs.readdirSync(dest).length} files)`);
