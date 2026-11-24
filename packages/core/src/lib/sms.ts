import { env } from "@ostiary/core/lib/env";
import { runAfterResponse } from "@ostiary/core/lib/background";
import { captureTestEmail, e2eTestMode } from "@ostiary/core/lib/e2e-test-mode";

/*
 * Text messages, for sign-in codes (Better Auth's phone-number plugin), sent through Twilio's
 * REST API. Off unless TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are set (env.ts).
 * End-to-end tests capture them in E2E_MAIL_FILE, as emails, with `kind` "sms".
 */

export { PHONE_NUMBER_PATTERN } from "@ostiary/core/lib/phone-number";

export function smsConfigured(): boolean {
  if (e2eTestMode() && process.env.E2E_SMS === "true") return true;
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
}

/** Sends after the response, like emails: a known number must not answer slower. Errors are logged. */
export function queueSms(kind: string, to: string, body: string, code?: string): void {
  runAfterResponse(`sms ${kind}`, async () => {
    if (captureTestEmail({ kind, to, subject: body, code })) return;
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    const from = env.TWILIO_FROM;
    if (!sid || !token || !from) {
      if (env.NODE_ENV === "development") console.info(`[sms] Twilio not configured; ${kind} for ${to}: ${body}`);
      return;
    }
    const form = new URLSearchParams({ To: to, Body: body, ...(from.startsWith("MG") ? { MessagingServiceSid: from } : { From: from }) });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    }).catch((error: unknown) => {
      console.error(`[sms] Twilio ${kind} error:`, error);
      return null;
    });
    if (response && !response.ok) console.error(`[sms] Twilio ${kind} error: ${response.status} ${await response.text().catch(() => "")}`);
  });
}
