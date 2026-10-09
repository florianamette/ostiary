import { existsSync, readFileSync } from "node:fs";

import { expect } from "@playwright/test";

import { MAIL_FILE } from "./env";

/** An email captured by the apps in test mode (packages/core/src/lib/e2e-test-mode.ts). */
export type CapturedEmail = { kind: string; to: string; subject: string; code?: string; url?: string; at: string };

export function readEmails(): CapturedEmail[] {
  if (!existsSync(MAIL_FILE)) return [];
  return readFileSync(MAIL_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedEmail);
}

/**
 * Waits for an email to `to` of this kind ("verification", "sign-in", "password reset"...) sent
 * after `since`, and returns the latest. Email is queued without awaiting, hence the polling.
 */
export async function waitForEmail(to: string, kind: string, since = 0): Promise<CapturedEmail> {
  let found: CapturedEmail | undefined;
  await expect
    .poll(
      () => {
        found = readEmails()
          .filter((m) => m.to === to.toLowerCase() || m.to === to)
          .filter((m) => m.kind === kind && Date.parse(m.at) >= since)
          .at(-1);
        return Boolean(found);
      },
      { message: `${kind} email to ${to}`, timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}
