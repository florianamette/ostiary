import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { isPasswordCompromised } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { passwordBreach, user as userTable } from "@ostiary/core/db/schema";
import { recordAccountEvent } from "@ostiary/core/lib/account-activity";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { PASSWORD_SIGN_IN_PATHS } from "@ostiary/core/lib/auth-hooks/sign-in-plugins";
import { type Bag, str } from "@ostiary/core/lib/auth-hooks/values";
import { e2eTestMode } from "@ostiary/core/lib/e2e-test-mode";
import { env } from "@ostiary/core/lib/env";

/*
 * Passwords that turn up in a breach after they were set. Better Auth's haveIBeenPwned plugin
 * checks a password only when it is set; this checks it again at each password sign-in, with
 * the plugin's own lookup (only 5 characters of its SHA-1 hash leave the server). A breached one
 * is recorded in password_breach: the app sign-in (the OAuth provider's post-login step) and the
 * account page then stop at /change-password until it changes. A lookup that fails or takes too
 * long never blocks the sign-in. Off with PASSWORD_BREACH_CHECK=off, and in e2e test mode.
 *
 * An admin can ask for the same step ("Require a password change" on the user page): the record
 * then has the reason "admin", and the step says so.
 */

export type PasswordChangeReason = "breached" | "admin";

/** The sign-in waits this long for Have I Been Pwned at most. */
const LOOKUP_TIMEOUT_MS = 2_500;

/** Endpoints that change the password: the record goes with the old password. */
const PASSWORD_CHANGE_PATHS = new Set(["/change-password", "/reset-password", "/admin/set-user-password", "/email-otp/reset-password", "/phone-number/reset-password"]);

export function breachCheckEnabled(): boolean {
    return env.PASSWORD_BREACH_CHECK !== "off" && !e2eTestMode();
}

/** Whether the lookup says breached; null when it failed or timed out. */
async function breached(password: string, lookup: (password: string) => Promise<boolean>): Promise<boolean | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            lookup(password),
            new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
            }),
        ]);
    } catch (error) {
        console.error("password breach lookup failed", error instanceof Error ? error.message : error);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function userOfSignIn(body: Bag): Promise<{ id: string; email: string } | null> {
    const email = str(body.email)?.trim().toLowerCase();
    const username = str(body.username)?.trim().toLowerCase();
    const where = email ? eq(sql`lower(${userTable.email})`, email) : username ? eq(sql`lower(${userTable.username})`, username) : null;
    if (!where) return null;
    const [found] = await db.select({ id: userTable.id, email: userTable.email }).from(userTable).where(where).limit(1);
    return found ?? null;
}

export async function markPasswordBreached(account: { id: string; email: string }, headers: Headers | null | undefined) {
    const inserted = await db
        .insert(passwordBreach)
        .values({ userId: account.id })
        .onConflictDoNothing()
        .returning({ userId: passwordBreach.userId });
    if (inserted.length === 0) return;
    await recordAudit({
        actor: null,
        action: "user.password_breached",
        target: { type: "user", id: account.id, label: account.email },
        ipAddress: clientIp(headers ?? null),
    });
    await recordAccountEvent("password_breached", account.id, { headers });
}

/** Why the person must change their password before going on, or null when they need not. */
export async function passwordChangeRequired(userId: string): Promise<PasswordChangeReason | null> {
    const [row] = await db.select({ reason: passwordBreach.reason }).from(passwordBreach).where(eq(passwordBreach.userId, userId)).limit(1);
    if (!row) return null;
    return row.reason === "admin" ? "admin" : "breached";
}

export async function passwordBreachPending(userId: string): Promise<boolean> {
    return (await passwordChangeRequired(userId)) !== null;
}

/** An admin's request: the next sign-in (or open session) stops at /change-password. */
export async function requirePasswordChange(userId: string): Promise<void> {
    await db
        .insert(passwordBreach)
        .values({ userId, reason: "admin" })
        // Already required (a breached password stays "breached", so the admin cannot cancel it).
        .onConflictDoNothing();
}

export async function clearPasswordBreach(userId: string): Promise<void> {
    await db.delete(passwordBreach).where(eq(passwordBreach.userId, userId));
}

/**
 * The plugin: after a successful password sign-in (also one that stops for two-factor
 * authentication), looks the password up; after a password change or reset, clears the record.
 */
export function passwordBreachSignInCheck(lookup: (password: string) => Promise<boolean> = isPasswordCompromised) {
    return {
        id: "ostiary-password-breach-sign-in",
        hooks: {
            after: [
                {
                    matcher: (ctx) => PASSWORD_SIGN_IN_PATHS.has(ctx.path ?? ""),
                    handler: createAuthMiddleware(async (ctx) => {
                        if (ctx.context.returned instanceof Error || !breachCheckEnabled()) return;
                        const body = (ctx.body ?? {}) as Bag;
                        const password = str(body.password);
                        if (!password) return;
                        if ((await breached(password, lookup)) !== true) return;
                        const account = await userOfSignIn(body);
                        if (account) await markPasswordBreached(account, ctx.headers);
                    }),
                },
                {
                    matcher: (ctx) => PASSWORD_CHANGE_PATHS.has(ctx.path ?? ""),
                    handler: createAuthMiddleware(async (ctx) => {
                        if (ctx.context.returned instanceof Error) return;
                        // A reset has no session: its callback clears the record (auth-factory.ts).
                        const userId = ctx.path === "/admin/set-user-password" ? str((ctx.body as Bag | undefined)?.userId) : ctx.context.session?.user.id;
                        if (userId) await clearPasswordBreach(userId);
                    }),
                },
            ],
        },
    } satisfies BetterAuthPlugin;
}
