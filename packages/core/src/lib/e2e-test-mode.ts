import { appendFileSync } from "node:fs";

import { isLoopbackHost } from "@better-auth/core/utils/host";

/*
 * Test seams for the end-to-end suite (e2e/). The suite runs both apps with `next start`, so
 * NODE_ENV is "production" there and cannot tell a test run from a real deployment. Test mode
 * is therefore an explicit opt-in that only takes effect on a machine-local deployment:
 *
 * - E2E_TEST_MODE=true, and
 * - the auth app's URL (AUTH_APP_URL, else BETTER_AUTH_URL) is http:// on a loopback host, and
 * - not a Vercel production deployment.
 *
 * A real deployment is served over HTTPS on a public host, so even if the variable leaked into
 * one, nothing below would change. What test mode changes:
 *
 * - Outgoing emails are appended to E2E_MAIL_FILE (JSON lines) instead of being sent.
 * - Webhook endpoints may be http://localhost (WEBHOOKS_ALLOW_LOCALHOST, which `next start`
 *   ignores as NODE_ENV is "production").
 * - The Have I Been Pwned password check (an external HTTP call) is skipped.
 */

type TestModeEnv = Record<string, string | undefined>;

/** Whether the end-to-end test seams are on, see above. Pure, for unit tests. */
export function isE2eTestMode(source: TestModeEnv): boolean {
  if (source.E2E_TEST_MODE !== "true") return false;
  if (source.VERCEL_ENV === "production") return false;
  const raw = source.AUTH_APP_URL || source.BETTER_AUTH_URL;
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

/** Test mode for this process (read from process.env, so it needs no other module). */
export function e2eTestMode(): boolean {
  const on = isE2eTestMode(process.env);
  // Once per process (Next.js may load this module more than once).
  const flags = globalThis as { __ostiaryE2eWarned?: boolean };
  if (on && !flags.__ostiaryE2eWarned) {
    flags.__ostiaryE2eWarned = true;
    console.warn("[e2e] E2E_TEST_MODE is on: emails go to E2E_MAIL_FILE, never use this outside tests.");
  }
  return on;
}

export type CapturedEmail = {
  kind: string;
  to: string;
  subject: string;
  code?: string;
  url?: string;
  at: string;
};

/**
 * In test mode with E2E_MAIL_FILE set, appends the email to that file (one JSON object per line)
 * and returns true; the caller then sends nothing. Otherwise returns false.
 */
export function captureTestEmail(email: Omit<CapturedEmail, "at">): boolean {
  const file = process.env.E2E_MAIL_FILE;
  if (!file || !e2eTestMode()) return false;
  appendFileSync(file, `${JSON.stringify({ ...email, at: new Date().toISOString() })}\n`);
  return true;
}
