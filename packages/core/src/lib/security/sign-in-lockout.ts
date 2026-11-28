import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { accountEvent, authEvent, user as userTable } from "@ostiary/core/db/schema";
import { recordAccountEvent } from "@ostiary/core/lib/account-activity";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { PASSWORD_SIGN_IN_PATHS } from "@ostiary/core/lib/auth-hooks/sign-in-plugins";
import { type Bag, str } from "@ostiary/core/lib/auth-hooks/values";
import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";
import { LOCKOUT_MINUTES } from "@ostiary/core/lib/auth-policy-options";
import { RATE_LIMITED_CODE } from "@ostiary/core/lib/rate-limit-message";

/*
 * Password sign-in for an email or username is refused for LOCKOUT_MINUTES once that many
 * minutes saw the admin console's number of wrong passwords for it (auth_event rows written by
 * the audit hook). Rate limits are per IP; this stops guessing spread over many addresses.
 *
 * - Counted per identifier tried, whether an account has it or not, and refused with the rate
 *   limiter's 429: the answer says nothing about which accounts exist.
 * - A successful sign-in, a password change or reset and "This wasn't me" start the count again.
 * - Refused attempts are not counted, so the lock ends LOCKOUT_MINUTES after the failures.
 * - Only passwords: passkeys, sign-in codes and links, social sign-in and SSO still work.
 */

const WINDOW_MS = LOCKOUT_MINUTES * 60_000;

/** Events after which earlier wrong passwords no longer count. */
const COUNT_RESET_EVENTS = ["sign_in", "password_changed", "password_reset", "account_secured"] as const;

/** The email or username a password sign-in tried, lowercased. */
export function signInIdentifier(body: unknown): string | null {
    const bag = (body ?? {}) as Bag;
    return (str(bag.email) ?? str(bag.username))?.trim().toLowerCase() || null;
}

async function accountOf(identifier: string): Promise<{ id: string; email: string } | null> {
    const [found] = await db
        .select({ id: userTable.id, email: userTable.email })
        .from(userTable)
        .where(identifier.includes("@") ? eq(sql`lower(${userTable.email})`, identifier) : eq(sql`lower(${userTable.username})`, identifier))
        .limit(1);
    return found ?? null;
}

export type LockoutState = { locked: false; failures: number } | { locked: true; failures: number; until: Date };

/** Wrong passwords for `identifier` that still count, and whether password sign-in is locked. */
export async function lockoutState(identifier: string, attempts: number, now: Date = new Date()): Promise<LockoutState & { account: { id: string; email: string } | null }> {
    let since = new Date(now.getTime() - WINDOW_MS);
    const account = await accountOf(identifier);
    if (account) {
        const [last] = await db
            .select({ at: accountEvent.createdAt })
            .from(accountEvent)
            .where(and(eq(accountEvent.userId, account.id), inArray(accountEvent.type, [...COUNT_RESET_EVENTS]), gt(accountEvent.createdAt, since)))
            .orderBy(desc(accountEvent.createdAt))
            .limit(1);
        if (last) since = last.at;
    }
    const failures = await db
        .select({ at: authEvent.createdAt })
        .from(authEvent)
        .where(and(eq(authEvent.type, "sign_in_failed"), eq(sql`lower(${authEvent.identifier})`, identifier), gt(authEvent.createdAt, since)))
        .orderBy(asc(authEvent.createdAt));
    if (attempts <= 0 || failures.length < attempts) return { locked: false, failures: failures.length, account };
    // Locked until enough of the failures are older than the window.
    const until = new Date(failures[failures.length - attempts].at.getTime() + WINDOW_MS);
    return until > now ? { locked: true, failures: failures.length, until, account } : { locked: false, failures: failures.length, account };
}

/** The refusal: the rate limiter's 429 and wait, which the sign-in screens already word. */
export function lockoutRefusal(until: Date, now: Date = new Date()): APIError {
    const retryAfter = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
    return new APIError(
        "TOO_MANY_REQUESTS",
        { code: RATE_LIMITED_CODE, message: "Too many requests. Please try again later.", retryAfter },
        { "Retry-After": String(retryAfter) },
    );
}

export function isLockoutRefusal(value: unknown): boolean {
    return value instanceof APIError && value.statusCode === 429 && (value.body as Bag | undefined)?.code === RATE_LIMITED_CODE;
}

/**
 * After a wrong password has been recorded (audit hook): when it is the one that locks, write
 * it in the account's history and the audit log.
 */
export async function noticeFailedPassword(identifier: string | null, headers: Headers | null | undefined): Promise<void> {
    if (!identifier) return;
    try {
        const { lockoutAttempts } = await currentAuthPolicy();
        if (lockoutAttempts <= 0) return;
        const state = await lockoutState(identifier.trim().toLowerCase(), lockoutAttempts);
        if (!state.locked || state.failures !== lockoutAttempts || !state.account) return;
        await recordAccountEvent("sign_in_locked", state.account.id, { headers });
        await recordAudit({
            actor: null,
            action: "user.sign_in_locked",
            target: { type: "user", id: state.account.id, label: state.account.email },
            metadata: { attempts: lockoutAttempts, minutes: LOCKOUT_MINUTES },
            ipAddress: clientIp(headers),
        });
    } catch (error) {
        console.error("sign-in lockout notice failed", error);
    }
}

export const signInLockout = {
    id: "ostiary-sign-in-lockout",
    hooks: {
        before: [
            {
                matcher: (ctx) => PASSWORD_SIGN_IN_PATHS.has(ctx.path ?? ""),
                handler: createAuthMiddleware(async (ctx) => {
                    const identifier = signInIdentifier(ctx.body);
                    if (!identifier) return;
                    const { lockoutAttempts } = await currentAuthPolicy();
                    if (lockoutAttempts <= 0) return;
                    const state = await lockoutState(identifier, lockoutAttempts);
                    if (state.locked) throw lockoutRefusal(state.until);
                }),
            },
        ],
    },
} satisfies BetterAuthPlugin;
