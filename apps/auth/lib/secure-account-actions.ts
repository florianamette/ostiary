"use server";

import { headers } from "next/headers";

import { recordAccountEvent } from "@ostiary/core/lib/account-activity";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { env } from "@ostiary/core/lib/env";
import { locales, routing, type AppLocale } from "@ostiary/core/i18n/routing";
import { consumeSecureAccountToken, SECURE_ACCOUNT_TOKEN, signOutEverywhere } from "@ostiary/core/lib/security/new-device";
import { revokeUserAccess } from "@ostiary/core/lib/security/user-access-revocation";
import { getBaseURL } from "@ostiary/core/lib/url";

import { auth } from "@/lib/auth";

export type SecureAccountResult = { ok: true } | { ok: false; error: "invalid" | "failed" };

/**
 * "This wasn't me", from the new-device email: signs the account out everywhere, revokes what
 * its apps hold, and emails a link to choose a new password. The token is used up first, so a
 * second click does nothing. No session is needed: the person may be signed out by now.
 */
export async function secureMyAccount(token: string, locale: string): Promise<SecureAccountResult> {
  if (typeof token !== "string" || !SECURE_ACCOUNT_TOKEN.test(token)) return { ok: false, error: "invalid" };
  const requestHeaders = await headers();
  const ipAddress = clientIp(requestHeaders);
  const account = await consumeSecureAccountToken(token);
  if (!account) return { ok: false, error: "invalid" };
  try {
    const sessions = await signOutEverywhere(account.id);
    await revokeUserAccess(account, "not_me", null, ipAddress);
    await recordAudit({
      actor: null,
      action: "user.secure_account",
      target: { type: "user", id: account.id, label: account.email },
      metadata: { sessions },
      ipAddress,
    });
    await recordAccountEvent("account_secured", account.id, { headers: requestHeaders });
    const lang: AppLocale = (locales as readonly string[]).includes(locale) ? (locale as AppLocale) : routing.defaultLocale;
    await auth.api.requestPasswordReset({
      body: { email: account.email, redirectTo: `${env.AUTH_APP_URL ?? getBaseURL()}/${lang}/reset-password` },
      headers: requestHeaders,
    });
  } catch (error) {
    console.error("Could not secure the account", error);
    return { ok: false, error: "failed" };
  }
  return { ok: true };
}
