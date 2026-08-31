import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(frontendRoot, "..");
const backendUrl = "http://127.0.0.1:3000";
const spawnOptions = {
  detached: process.platform !== "win32",
  stdio: "inherit",
};
const childProcesses = [
  spawn("bun", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5174", "--strict-port"], {
    cwd: path.join(repositoryRoot, "web"),
    env: {
      ...process.env,
      VITE_REACT_APP_SERVER_URL: backendUrl,
    },
    ...spawnOptions,
  }),
  spawn("bun", ["run", "--cwd", "apps/console", "dev:gateway"], {
    cwd: frontendRoot,
    env: process.env,
    ...spawnOptions,
  }),
];

let stopping = false;

function stopChildren(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const childProcess of childProcesses) {
    if (childProcess.exitCode !== null) continue;
    if (process.platform === "win32" || childProcess.pid === undefined) {
      childProcess.kill(signal);
      continue;
    }
    try {
      process.kill(-childProcess.pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

process.once("SIGINT", () => stopChildren("SIGINT"));
process.once("SIGTERM", () => stopChildren("SIGTERM"));

const exitCode = await Promise.race(
  childProcesses.map(
    (childProcess) =>
      new Promise((resolve) => {
        childProcess.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
      }),
  ),
);

stopChildren();
process.exitCode = exitCode;
