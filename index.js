/**
 * Railpack / Railway entry. Starts the Portal gateway from the repo root.
 */
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const entry = resolve(__dirname, "apps/portal-api/dist/server.js");
if (!existsSync(entry)) {
  console.error("Portal API is not built. Expected", entry);
  process.exit(1);
}

const child = spawn(process.execPath, ["--conditions=production", entry], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
