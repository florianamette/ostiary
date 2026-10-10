import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import type { JwtOptions } from "better-auth/plugins";
import type { oauthProvider } from "@better-auth/oauth-provider";

import { db } from "@ostiary/core/db/index";
import { clientIp, recordAuthEvent } from "@ostiary/core/lib/auth-events";
import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { isPlatformAdmin } from "@ostiary/core/lib/admin/user-has-admin-role";
import { publicOrganizationRequestRefused } from "@ostiary/core/lib/security/public-organization-guard";
import { parseSsoDomain } from "@ostiary/core/lib/security/sso-domain";
import { env } from "@ostiary/core/lib/env";
import { syncProviderScopes } from "@ostiary/core/lib/oauth-scopes";
import { syncSigningKeys } from "@ostiary/core/lib/signing-keys";
import { googleOneTap, syncSocialProviders } from "@ostiary/core/lib/social-providers";
import { registrationCapacityLeft, syncClientRegistration } from "@ostiary/core/lib/client-registration";
import { registrationRequestError, type ClientRegistrationSettings } from "@ostiary/core/lib/client-registration-policy";
import { ACCOUNT_DELETION_BLOCKED, accountDeletionBlockers } from "@ostiary/core/lib/account-data/blockers";
import type { Bag } from "@ostiary/core/lib/auth-hooks/values";

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * Endpoints that grant lasting access to the account. They need a sign-in from the last
 * 10 minutes, measured from when the session was created: Better Auth's own `freshAge`
 * counts from the session's last refresh, which a stolen cookie can trigger by itself.
 */
const RECENT_SIGN_IN_PATHS = new Set([
    "/passkey/generate-register-options",
    "/passkey/verify-registration",
    // Connecting a GitHub (or other) account adds a way to sign in, like a passkey.
    "/link-social",
]);
export const RECENT_SIGN_IN_SECONDS = 10 * 60;

/** Whether the session was created (signed in) longer than RECENT_SIGN_IN_SECONDS ago. */
function signInTooOld(session: { createdAt: Date | string }): boolean {
    return Date.now() - new Date(session.createdAt).getTime() > RECENT_SIGN_IN_SECONDS * 1000;
}

/** Admin-only endpoints. An admin who must turn on two-factor authentication first cannot call them. */
function isAdminPath(path: string): boolean {
    // Never block the way back from impersonation.
    if (path === "/admin/stop-impersonating") return false;
    return path.startsWith("/admin/") || path === "/sso/register" || path === "/organization/create";
}

/** Refuses a deletion while one of the blockers applies (admin, sole owner, SCIM). */
export async function assertAccountDeletable(userId: string) {
    const blockers = await accountDeletionBlockers(db, userId);
    if (blockers.length === 0) return;
    throw new APIError("FORBIDDEN", {
        message: "This account cannot be deleted yet. See the account page for what to do first.",
        code: ACCOUNT_DELETION_BLOCKED,
        blockers: blockers.map((b) => b.kind),
    });
}

async function requireAdminTwoFactor(ctx: Ctx) {
    const current = await getSessionFromCtx(ctx);
    if (current && adminNeedsTwoFactor(current.user as { role?: string | null; twoFactorEnabled?: boolean | null }, true)) {
        throw new APIError("FORBIDDEN", {
            message: "Turn on two-factor authentication to use admin features.",
            code: "TWO_FACTOR_REQUIRED",
        });
    }
}

/**
 * Better Auth checks scopes, redirect URIs and PKCE. Self-registered clients also get no
 * machine access, and an hourly cap across instances limits abuse (on top of Better Auth's
 * per-IP limit of 5 registrations a minute).
 */
async function guardDynamicRegistration(ctx: Ctx, registration: ClientRegistrationSettings) {
    const refused = registrationRequestError(ctx.body);
    if (refused) {
        throw new APIError("BAD_REQUEST", { error: "invalid_client_metadata", error_description: refused });
    }
    if (!(await registrationCapacityLeft(registration))) {
        throw new APIError("TOO_MANY_REQUESTS", {
            error: "temporarily_unavailable",
            error_description: "Too many clients registered in the last hour. Try again later.",
        });
    }
}

/**
 * One parser for the domain everywhere (sso-domain.ts): a value that the plugin (tldts) and
 * the DNS verification (URL) could read differently is refused.
 */
function guardSsoRegistration(ctx: Ctx) {
    const domain = (ctx.body as Bag | undefined)?.domain;
    if (typeof domain !== "string" || parseSsoDomain(domain) !== domain) {
        throw new APIError("BAD_REQUEST", {
            message: "Enter one email domain in lowercase, e.g. acme.com.",
            code: "INVALID_SSO_DOMAIN",
        });
    }
}

/** The Public organization holds every account: its members are not listed to them. */
async function guardOrganizationRequest(ctx: Ctx) {
    const current = await getSessionFromCtx(ctx);
    if (!current) return; // The endpoint answers 401.
    const input = { ...((ctx.query ?? {}) as Bag), ...((ctx.body ?? {}) as Bag) };
    const refused = publicOrganizationRequestRefused(ctx.path, input, {
        isPlatformAdmin: isPlatformAdmin(current.user.role),
        activeOrganizationId: (current.session as { activeOrganizationId?: string | null }).activeOrganizationId,
    });
    if (refused) {
        throw new APIError("FORBIDDEN", {
            message: "The Public organization's members are managed by platform admins only.",
            code: "PUBLIC_ORGANIZATION_RESTRICTED",
        });
    }
}

/** Adding a way to sign in (RECENT_SIGN_IN_PATHS). */
async function requireRecentSignIn(ctx: Ctx) {
    const current = await getSessionFromCtx(ctx);
    // An impersonation session is fresh too, but an admin viewing an account must
    // not add their own way into it.
    if (current?.session.impersonatedBy) {
        throw new APIError("FORBIDDEN", {
            message: "A sign-in method cannot be added while an administrator is viewing the account.",
            code: "IMPERSONATING",
        });
    }
    if (current && signInTooOld(current.session)) {
        throw new APIError("FORBIDDEN", {
            message: "Sign in again to add a new way to sign in.",
            code: "RECENT_SIGN_IN_REQUIRED",
        });
    }
}

/**
 * Self-service deletion. Step 1 (no token) sends the confirmation email; step 2 (the emailed
 * token) deletes. Better Auth ties the token to the signed-in account.
 */
async function guardAccountDeletion(ctx: Ctx) {
    const current = await getSessionFromCtx(ctx);
    if (!current) return; // The endpoint answers 401.
    if (current.session.impersonatedBy) {
        throw new APIError("FORBIDDEN", {
            message: "An account cannot be deleted while an administrator is viewing it.",
            code: "IMPERSONATING",
        });
    }
    const body = (ctx.body ?? {}) as Bag;
    // Blockers are checked again on step 2 (beforeDelete), as things may change in between.
    if (typeof body.token === "string" && body.token) return;
    await assertAccountDeletable(current.user.id);
    // Re-enter the password when there is one (Better Auth checks it). Without one
    // (passkey, social, SSO, codes), the sign-in itself must be recent.
    if (typeof body.password === "string" && body.password) return;
    const credential = await ctx.context.internalAdapter.findCredentialAccount(current.user.id);
    if (credential?.password) {
        throw new APIError("FORBIDDEN", {
            message: "Enter your password to delete your account.",
            code: "PASSWORD_REQUIRED",
        });
    }
    if (signInTooOld(current.session)) {
        throw new APIError("FORBIDDEN", {
            message: "Sign in again to delete your account.",
            code: "RECENT_SIGN_IN_REQUIRED",
        });
    }
}

/**
 * Better Auth only asks the current inbox to approve a change when that address is verified;
 * for an unverified one it emails the new address directly. Refuse that case so a stolen
 * session cookie alone can never move an account to another inbox.
 */
async function guardEmailChange(ctx: Ctx) {
    const current = await getSessionFromCtx(ctx);
    if (current && !current.user.emailVerified) {
        throw new APIError("FORBIDDEN", {
            message: "Verify your current email address before changing it.",
            code: "EMAIL_NOT_VERIFIED",
        });
    }
}

/** Signing out of one of several accounts (account switcher) deletes that session only. */
async function recordAccountSignOut(ctx: Ctx) {
    const token = (ctx.body as { sessionToken?: unknown } | undefined)?.sessionToken;
    const revoked = typeof token === "string" ? await ctx.context.internalAdapter.findSession(token) : null;
    if (revoked) await recordAuthEvent("sign_out", revoked.user.id, { ipAddress: clientIp(ctx.headers) });
}

/**
 * Sign-out deletes the session, so read who is signing out before the handler runs.
 * With several accounts signed in, it signs out of all of them; this records the active one.
 */
async function recordSignOut(ctx: Ctx) {
    const current = await getSessionFromCtx(ctx);
    if (current) await recordAuthEvent("sign_out", current.user.id, { ipAddress: clientIp(ctx.headers) });
}

/**
 * Before every request: applies the admin console's settings to this instance, then the
 * checks Ostiary adds to some endpoints.
 */
export function guardRequests({
    provider,
    jwtOptions,
    metadataDocuments,
}: {
    provider: ReturnType<typeof oauthProvider>;
    jwtOptions: JwtOptions;
    metadataDocuments: unknown;
}) {
    return createAuthMiddleware(async (ctx) => {
        // APIs registered from the admin console add scopes without a redeploy.
        await syncProviderScopes(provider.options);
        // Signing key rotation interval and grace period, from the admin console.
        await syncSigningKeys(jwtOptions);
        // Sign-in providers enabled from the admin console, without a restart.
        await syncSocialProviders(ctx.context);
        // Google One Tap answers only while the admin console has it on (and Google too).
        if (ctx.path === "/one-tap/callback" && !(await googleOneTap())) {
            throw new APIError("NOT_FOUND", { message: "Google One Tap is not enabled." });
        }
        if (env.REQUIRE_ADMIN_2FA === "true" && isAdminPath(ctx.path)) await requireAdminTwoFactor(ctx);
        const registration = await syncClientRegistration(provider.options, metadataDocuments);
        // Device sign-in is for admin-registered clients only: see oauthClientGuard.
        if (ctx.path === "/oauth2/register" && registration.dynamic !== "off") return guardDynamicRegistration(ctx, registration);
        if (ctx.path === "/sso/register") return guardSsoRegistration(ctx);
        if (ctx.path.startsWith("/organization/")) return guardOrganizationRequest(ctx);
        if (RECENT_SIGN_IN_PATHS.has(ctx.path)) return requireRecentSignIn(ctx);
        if (ctx.path === "/delete-user") return guardAccountDeletion(ctx);
        if (ctx.path === "/change-email") return guardEmailChange(ctx);
        if (ctx.path === "/multi-session/revoke") return recordAccountSignOut(ctx);
        if (ctx.path === "/sign-out") return recordSignOut(ctx);
    });
}
