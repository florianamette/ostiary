import { createHash, randomBytes } from "node:crypto";
import type { GenericEndpointContext } from "better-auth";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { verification } from "@ostiary/core/db/schema";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import { env } from "@ostiary/core/lib/env";
import { resolveSafeRedirect } from "@ostiary/core/lib/safe-redirect";
import { SIGN_IN_CODE_MINUTES } from "@ostiary/core/lib/sign-in-code";
import { getBaseURL } from "@ostiary/core/lib/url";
import { SIGN_IN_LINK_CALLBACK_HEADER } from "@ostiary/core/lib/sign-in-link-header";

/*
 * Sign-in links: the sign-in code email also carries a button that signs in, for people who
 * read it on the device they are signing in on. The token is Better Auth's magicLink plugin's
 * (same record, verified and consumed by its /magic-link/verify), created here when the code
 * email goes out, so the link follows the code's rules: existing accounts only, same expiry,
 * same rate limit. The plugin's own /sign-in/magic-link is off (auth-factory.ts).
 *
 * The button leads to the auth app's /sign-in-link page, not to the verify endpoint: opening a
 * link signs nothing in (mail scanners follow links), the person presses "Sign in".
 */

export { SIGN_IN_LINK_CALLBACK_HEADER } from "@ostiary/core/lib/sign-in-link-header";
export const SIGN_IN_LINK_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

/** The magicLink plugin's `storeToken` hasher: only a hash is in the database. */
export async function hashSignInLinkToken(token: string): Promise<string> {
  return createHash("sha256").update(token).digest("base64url");
}

const identifier = async (token: string) => `magic-link:${await hashSignInLinkToken(token)}`;

/** Where the link goes after signing in: the sign-in form's callback when safe, else the account page. */
export function signInLinkCallback(raw: string | null | undefined, locale: AppLocale): string {
  const target = resolveSafeRedirect(raw ?? null, { origin: env.AUTH_APP_URL ?? getBaseURL() });
  return target ? `${target.pathname}${target.search}` : `/${locale}/dashboard`;
}

/** Creates a link for this address (an existing account: emailOTP is called for no other). */
export async function createSignInLink(ctx: GenericEndpointContext, email: string, locale: AppLocale): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await ctx.context.internalAdapter.createVerificationValue({
    identifier: await identifier(token),
    value: JSON.stringify({ type: "magic-link", email }),
    expiresAt: new Date(Date.now() + SIGN_IN_CODE_MINUTES * 60_000),
  });
  const callbackURL = signInLinkCallback(ctx.headers?.get(SIGN_IN_LINK_CALLBACK_HEADER), locale);
  const url = new URL(`/${locale}/sign-in-link`, env.AUTH_APP_URL ?? getBaseURL());
  url.searchParams.set("token", token);
  url.searchParams.set("callbackURL", callbackURL);
  return url.toString();
}

/** The address a live link signs in to, for its page; null when unknown, used or expired. */
export async function signInLinkEmail(token: string): Promise<string | null> {
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(and(eq(verification.identifier, await identifier(token)), gt(verification.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as { type?: unknown; email?: unknown };
    return parsed.type === "magic-link" && typeof parsed.email === "string" ? parsed.email : null;
  } catch {
    return null;
  }
}
