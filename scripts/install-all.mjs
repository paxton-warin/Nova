import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");

const rawArgs = process.argv.slice(2);
const corepackCommand = process.platform === "win32" ? "corepack.cmd" : "corepack";
const pnpmArgs = ["pnpm", ...(rawArgs.length > 0 ? rawArgs : ["install"])];

if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  console.log(`Usage: pnpm run install:all -- [pnpm install args]

Examples:
  pnpm run install:all
  pnpm run install:all -- --frozen-lockfile
  pnpm run install:all -- install --offline
`);
  process.exit(0);
}

function runInstall(cwd, label) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(corepackCommand, pnpmArgs, {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runInstall(rootDir, "Installing root dependencies");
runInstall(frontendDir, "Installing frontend dependencies");
