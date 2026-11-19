import { Resend } from "resend";

import { env } from "@ostiary/core/lib/env";
import { runAfterResponse } from "@ostiary/core/lib/background";
import { renderEmail, type EmailContent } from "@ostiary/core/lib/email/layout";
import { captureTestEmail } from "@ostiary/core/lib/e2e-test-mode";

/**
 * Sends an email via Resend after the response, so the caller never waits for the network
 * (timing-attack guidance in Better Auth docs: a known address must not answer slower) and the
 * send still finishes on serverless platforms. Errors are logged, never thrown. Every email goes
 * through here; `prepare` builds the subject and content when that needs async work (loading
 * the messages of a locale).
 * In development without Resend, logs the link or code so local flows still work.
 */
export function queueEmail(
  kind: string,
  to: string,
  prepare: { subject: string; content: EmailContent } | (() => Promise<{ subject: string; content: EmailContent }>),
): void {
  runAfterResponse(`email ${kind}`, async () => {
    const { subject, content } = typeof prepare === "function" ? await prepare() : prepare;
    await sendEmail(kind, to, subject, content);
  });
}

async function sendEmail(kind: string, to: string, subject: string, content: EmailContent): Promise<void> {
  // End-to-end tests only (E2E_TEST_MODE on a loopback URL): written to a file, never sent.
  if (captureTestEmail({ kind, to, subject, code: content.code, url: content.button?.url })) return;

  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();

  if (!key || !from) {
    if (env.NODE_ENV === "development") {
      const what = content.code ? `code for ${to}: ${content.code}` : `link for ${to}: ${content.button?.url}`;
      console.info(`[email] Resend not configured; ${kind} ${what}`);
    }
    return;
  }

  const { html, text } = renderEmail(content);
  const result = await new Resend(key).emails.send({ from, to, subject, html, text });
  if (result.error) console.error(`[email] Resend ${kind} error:`, result.error.message);
}
