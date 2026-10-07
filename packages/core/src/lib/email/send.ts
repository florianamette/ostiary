import { Resend } from "resend";

import { env } from "@ostiary/core/lib/env";
import { renderEmail, type EmailContent } from "@ostiary/core/lib/email/layout";

/**
 * Sends an email via Resend without awaiting the network call
 * (timing-attack guidance in Better Auth docs). Errors are logged, not thrown.
 * In development without Resend, logs the link so local flows still work.
 */
export function queueEmail(kind: string, to: string, subject: string, content: EmailContent): void {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();

  if (!key || !from) {
    if (env.NODE_ENV === "development") {
      console.info(`[email] Resend not configured; ${kind} link for ${to}: ${content.button.url}`);
    }
    return;
  }

  const { html, text } = renderEmail(content);
  void new Resend(key).emails
    .send({ from, to, subject, html, text })
    .then((result) => {
      if (result.error) console.error(`[email] Resend ${kind} error:`, result.error.message);
    });
}
