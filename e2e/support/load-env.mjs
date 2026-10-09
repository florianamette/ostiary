// Loads e2e/.env.test.local and e2e/.env.test into process.env (variables already set win) and makes E2E_MAIL_FILE
// absolute, as the apps run from their own directories. Shared by playwright.config.ts and
// scripts/with-env.mjs.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadTestEnv() {
  // Optional, not committed: local overrides such as DATABASE_URL.
  config({ path: path.join(E2E_DIR, ".env.test.local"), quiet: true });
  config({ path: path.join(E2E_DIR, ".env.test"), quiet: true });
  const mail = process.env.E2E_MAIL_FILE ?? ".data/mail.jsonl";
  process.env.E2E_MAIL_FILE = path.resolve(E2E_DIR, mail);
  mkdirSync(path.dirname(process.env.E2E_MAIL_FILE), { recursive: true });
  return process.env;
}
