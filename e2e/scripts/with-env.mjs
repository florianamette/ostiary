// Runs a command with the end-to-end environment (e2e/.env.test), e.g. the build or migrations.
import { spawnSync } from "node:child_process";
import { loadTestEnv } from "../support/load-env.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/with-env.mjs <command> [args...]");
  process.exit(2);
}
const result = spawnSync(command, args, { stdio: "inherit", env: loadTestEnv() });
process.exit(result.status ?? 1);
