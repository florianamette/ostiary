import { and, count, eq, min } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { member, organizationPolicy, passkey } from "@ostiary/core/db/schema";
import type { AuthPolicy } from "@ostiary/core/lib/auth-policy-options";
import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";

/*
 * Two-factor authentication required for everyone (the session and password policy) or for an
 * organization's members (organization_policy). Enforced when someone signs in to an app, with
 * the OAuth provider's post-login step (auth-factory.ts, `postLogin`): an account without it is
 * sent to the auth app's /two-factor/required page, after sign-in and before consent. During
 * the grace period that page lets them go on (/oauth2/continue) and asks again at the next app
 * sign-in; after it, they turn it on first. A passkey counts: it is already two factors.
 * Admins are covered by REQUIRE_ADMIN_2FA, as before.
 */

const DAY_MS = 24 * 60 * 60 * 1000;


export type TwoFactorRequirement =
  | { required: false }
  | { required: true; deadline: Date; source: "platform" | "organization" };

/**
 * When an account must have two-factor authentication: the grace period runs from when it
 * became required, or from the account's creation if later.
 */
export function twoFactorDeadline(
  since: { platform: Date | null; organization: Date | null },
  createdAt: Date,
  graceDays: number,
): { deadline: Date; source: "platform" | "organization" } | null {
  const sources = (["platform", "organization"] as const).filter((s) => since[s]);
  if (sources.length === 0) return null;
  // The earliest requirement applies.
  const source = sources.reduce((a, b) => (since[a]!.getTime() <= since[b]!.getTime() ? a : b));
  const start = Math.max(since[source]!.getTime(), createdAt.getTime());
  return { deadline: new Date(start + graceDays * DAY_MS), source };
}

type Account = { id: string; createdAt: Date | string; twoFactorEnabled?: boolean | null };

export async function twoFactorRequirement(user: Account, policy: AuthPolicy): Promise<TwoFactorRequirement> {
  if (user.twoFactorEnabled) return { required: false };
  const [organization] = await db
    .select({ since: min(organizationPolicy.requireTwoFactorSince) })
    .from(organizationPolicy)
    .innerJoin(member, eq(member.organizationId, organizationPolicy.organizationId))
    .where(and(eq(member.userId, user.id), eq(organizationPolicy.requireTwoFactor, true)));
  const platform = policy.twoFactorEveryone && policy.twoFactorRequiredSince ? new Date(policy.twoFactorRequiredSince) : null;
  const found = twoFactorDeadline(
    { platform, organization: organization?.since ? new Date(organization.since) : null },
    new Date(user.createdAt),
    policy.twoFactorGraceDays,
  );
  if (!found) return { required: false };
  const [passkeys] = await db.select({ n: count() }).from(passkey).where(eq(passkey.userId, user.id));
  if ((passkeys?.n ?? 0) > 0) return { required: false };
  return { required: true, ...found };
}

/** Requires (or stops requiring) two-factor authentication for an organization's members. */
export async function setOrganizationTwoFactor(organizationId: string, required: boolean, updatedBy: string | null) {
  const now = new Date();
  const [current] = await db
    .select()
    .from(organizationPolicy)
    .where(eq(organizationPolicy.organizationId, organizationId))
    .limit(1);
  const since = required ? (current?.requireTwoFactor && current.requireTwoFactorSince) || now : null;
  await db
    .insert(organizationPolicy)
    .values({ organizationId, requireTwoFactor: required, requireTwoFactorSince: since, updatedAt: now, updatedBy })
    .onConflictDoUpdate({
      target: organizationPolicy.organizationId,
      set: { requireTwoFactor: required, requireTwoFactorSince: since, updatedAt: now, updatedBy },
    });
}

export async function organizationRequiresTwoFactor(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ required: organizationPolicy.requireTwoFactor })
    .from(organizationPolicy)
    .where(eq(organizationPolicy.organizationId, organizationId))
    .limit(1);
  return Boolean(row?.required);
}

/** The prompt's path, as the OAuth provider sends people to it (with the signed request). */
export const TWO_FACTOR_PROMPT_PATH = "/two-factor/required";

/**
 * The prompt to come back to from the account page once two-factor is on: a path of the auth
 * app to that page (with its signed request), nothing else (an open redirect otherwise).
 */
export function promptToResume(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  try {
    const url = new URL(raw, "http://auth.invalid");
    if (url.origin !== "http://auth.invalid") return null;
    const path = url.pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
    return path === TWO_FACTOR_PROMPT_PATH ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

/**
 * The OAuth provider's `postLogin.shouldRedirect`: send the person to the prompt when the
 * account needs two-factor authentication. During the grace period, coming back from the
 * prompt ("Remind me later") goes on.
 */
export async function shouldPromptForTwoFactor(user: Account, isContinuation: boolean): Promise<boolean> {
  const requirement = await twoFactorRequirement(user, await currentAuthPolicy());
  if (!requirement.required) return false;
  return !(isContinuation && requirement.deadline > new Date());
}
