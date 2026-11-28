import { and, eq, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { scimUser, session as sessionTable, user as userTable, userLastSignIn } from "@ostiary/core/db/schema";
import { isPlatformAdmin } from "@ostiary/core/lib/admin/user-has-admin-role";
import { recordAudit } from "@ostiary/core/lib/audit";
import { loadAuthPolicy } from "@ostiary/core/lib/auth-policy";
import { INACTIVE_REASON, INACTIVE_WARNING_DAYS, type InactiveAction } from "@ostiary/core/lib/auth-policy-options";
import { emailLocale } from "@ostiary/core/lib/email/email-locale";
import { queueInactiveAccountEmail } from "@ostiary/core/lib/email/queue-inactive-account-email";
import { env } from "@ostiary/core/lib/env";
import { routing, type AppLocale } from "@ostiary/core/i18n/routing";
import { getBaseURL } from "@ostiary/core/lib/url";

/*
 * Accounts nobody uses (admin console, Security: "Inactive accounts"). An account is active from
 * its last sign-in, the last use of one of its sessions, its creation, or when the rule was
 * turned on, whichever is latest. INACTIVE_WARNING_DAYS before the limit, the person is emailed
 * (signing in keeps the account); at the limit, and at least that long after the email, the daily
 * cron disables (bans) or deletes the account. Admins, accounts a SCIM directory manages and
 * accounts already banned are left alone.
 */

export { INACTIVE_REASON };
/** What the sign-in of an account disabled by this rule shows. */
export const INACTIVE_MESSAGE = "This account was disabled after a long time without use.";

const DAY_MS = 86_400_000;
/** Accounts handled per cron run, so a run stays well within its time. */
const BATCH = 50;

/** Each sign-in (security/new-device.ts). Never throws. */
export async function noteSignIn(userId: string, headers: Headers | null | undefined, now: Date = new Date()): Promise<void> {
    try {
        const locale = emailLocale(headers ?? undefined);
        await db
            .insert(userLastSignIn)
            .values({ userId, signedInAt: now, locale, warnedAt: null })
            .onConflictDoUpdate({ target: userLastSignIn.userId, set: { signedInAt: now, locale, warnedAt: null } });
    } catch (error) {
        console.error("user_last_sign_in upsert failed", error);
    }
}

/** What the cron needs from Better Auth: its adapter runs the database hooks and webhooks. */
export type InactiveAccountsContext = {
    internalAdapter: {
        updateUser: (userId: string, data: Record<string, unknown>) => Promise<unknown>;
        deleteUserSessions: (userId: string) => Promise<unknown>;
        deleteUser: (userId: string) => Promise<unknown>;
    };
};

export type InactiveSweep = { warned: number; disabled: number; deleted: number };

function asLocale(value: string | null): AppLocale {
    return (routing.locales as readonly string[]).includes(value ?? "") ? (value as AppLocale) : routing.defaultLocale;
}

/** The daily run: warns, then disables or deletes. */
export async function sweepInactiveAccounts(ctx: InactiveAccountsContext, now: Date = new Date()): Promise<InactiveSweep> {
    const counts: InactiveSweep = { warned: 0, disabled: 0, deleted: 0 };
    const policy = await loadAuthPolicy();
    if (!policy.inactiveDays || !policy.inactiveSince) return counts;
    const since = new Date(policy.inactiveSince);
    const limitMs = policy.inactiveDays * DAY_MS;
    const warningMs = INACTIVE_WARNING_DAYS * DAY_MS;

    const lastSession = db
        .select({ userId: sessionTable.userId, at: sql<Date>`max(${sessionTable.updatedAt})`.as("at") })
        .from(sessionTable)
        .groupBy(sessionTable.userId)
        .as("last_session");
    const lastActive = sql<Date>`greatest(${userTable.createdAt}, ${since.toISOString()}::timestamptz, ${userLastSignIn.signedInAt}, ${lastSession.at})`;
    const rows = await db
        .select({
            id: userTable.id,
            email: userTable.email,
            role: userTable.role,
            locale: userLastSignIn.locale,
            warnedAt: userLastSignIn.warnedAt,
            lastActive: lastActive.as("last_active"),
        })
        .from(userTable)
        .leftJoin(userLastSignIn, eq(userLastSignIn.userId, userTable.id))
        .leftJoin(lastSession, eq(lastSession.userId, userTable.id))
        .where(
            and(
                sql`coalesce(${userTable.banned}, false) = false`,
                sql`not exists (select 1 from ${scimUser} where ${scimUser.userId} = ${userTable.id})`,
                sql`${lastActive} < ${new Date(now.getTime() - limitMs + warningMs).toISOString()}::timestamptz`,
            ),
        )
        .orderBy(lastActive)
        .limit(BATCH * 2);

    const baseUrl = env.AUTH_APP_URL ?? getBaseURL();
    let handled = 0;
    for (const row of rows) {
        if (handled >= BATCH) break;
        if (isPlatformAdmin(row.role)) continue;
        handled++;
        const lastActiveAt = new Date(row.lastActive);
        const deadline = new Date(lastActiveAt.getTime() + limitMs);
        // A warning counts only for this stretch of inactivity, and gives its full notice.
        const warnedAt = row.warnedAt && row.warnedAt >= lastActiveAt ? row.warnedAt : null;
        try {
            if (!warnedAt) {
                await warn(row, deadline, now, warningMs, policy.inactiveAction, baseUrl);
                counts.warned++;
            } else if (now >= deadline && now.getTime() >= warnedAt.getTime() + warningMs) {
                await act(ctx, row, policy.inactiveAction, policy.inactiveDays, lastActiveAt);
                counts[policy.inactiveAction === "delete" ? "deleted" : "disabled"]++;
            }
        } catch (error) {
            console.error("[inactive-accounts] could not handle", row.id, error);
        }
    }
    return counts;
}

async function warn(
    row: { id: string; email: string; locale: string | null },
    deadline: Date,
    now: Date,
    warningMs: number,
    action: InactiveAction,
    baseUrl: string,
) {
    const on = new Date(Math.max(deadline.getTime(), now.getTime() + warningMs));
    await db
        .insert(userLastSignIn)
        .values({ userId: row.id, signedInAt: null, locale: row.locale, warnedAt: now })
        .onConflictDoUpdate({ target: userLastSignIn.userId, set: { warnedAt: now } });
    const locale = asLocale(row.locale);
    queueInactiveAccountEmail({ email: row.email, action, on, url: `${baseUrl}/${locale}/login`, locale });
}

async function act(ctx: InactiveAccountsContext, row: { id: string; email: string }, action: InactiveAction, days: number, lastActive: Date) {
    if (action === "delete") {
        await ctx.internalAdapter.deleteUser(row.id);
    } else {
        // As an admin's ban: the update hook revokes app tokens, and the sessions go.
        await ctx.internalAdapter.updateUser(row.id, { banned: true, banReason: INACTIVE_REASON, banExpires: null });
        await ctx.internalAdapter.deleteUserSessions(row.id);
    }
    await recordAudit({
        actor: null,
        action: action === "delete" ? "user.inactive_deleted" : "user.inactive_disabled",
        // A deleted account's audit entries keep no email (account-data/erasure.ts).
        target: { type: "user", id: row.id, label: action === "delete" ? null : row.email },
        metadata: { days, lastActive: lastActive.toISOString() },
    });
}
