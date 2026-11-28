import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { accountEvent, session as sessionTable } from "@ostiary/core/db/schema";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { env } from "@ostiary/core/lib/env";

/*
 * A person's own security history ("Recent activity" on the account page). Recorded from the
 * sign-in check (security/new-device.ts), the account hooks (auth-hooks/account-activity-hook.ts),
 * the password reset callback and "This wasn't me". Never throws: history must not break the
 * action it records.
 */

export const ACCOUNT_EVENT_TYPES = [
    "sign_in",
    "password_changed",
    "password_reset",
    "email_changed",
    "two_factor_enabled",
    "two_factor_disabled",
    "passkey_added",
    "passkey_removed",
    "session_revoked",
    "sessions_revoked",
    "account_secured",
    "password_breached",
    "sign_in_locked",
] as const;

export type AccountEventType = (typeof ACCOUNT_EVENT_TYPES)[number];

/** The account page shows this many days. */
export const ACCOUNT_ACTIVITY_DAYS = 30;
export const ACCOUNT_ACTIVITY_PAGE = 20;
const DAY_MS = 86_400_000;

export type AccountEventDetails = {
    headers?: Headers | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    sessionId?: string | null;
    newDevice?: boolean;
};

export async function recordAccountEvent(type: AccountEventType, userId: string, details: AccountEventDetails = {}): Promise<void> {
    try {
        const headers = details.headers ?? null;
        await db.insert(accountEvent).values({
            id: randomUUID(),
            userId,
            type,
            ipAddress: details.ipAddress ?? clientIp(headers),
            userAgent: (details.userAgent ?? headers?.get("user-agent") ?? null)?.slice(0, 512) ?? null,
            sessionId: details.sessionId ?? null,
            newDevice: details.newDevice ?? false,
        });
    } catch (error) {
        console.error("account_event insert failed", error);
    }
}

export type AccountActivityItem = {
    id: string;
    type: AccountEventType;
    at: string;
    ipAddress: string | null;
    userAgent: string | null;
    newDevice: boolean;
    /** For a sign-in whose session is still open: its id, to sign it out. */
    openSessionId: string | null;
    /** That open session is the one viewing the page. */
    current: boolean;
};

export type AccountActivityPage = { items: AccountActivityItem[]; next: string | null };

/**
 * One page of the person's last ACCOUNT_ACTIVITY_DAYS, newest first. `before` is the `next` of
 * the previous page (an event's time, ISO).
 */
export async function listAccountActivity(
    userId: string,
    options: { before?: string | null; currentSessionId?: string | null; now?: Date } = {},
): Promise<AccountActivityPage> {
    const now = options.now ?? new Date();
    const before = options.before && !Number.isNaN(Date.parse(options.before)) ? new Date(options.before) : null;
    const rows = await db
        .select()
        .from(accountEvent)
        .where(
            and(
                eq(accountEvent.userId, userId),
                gte(accountEvent.createdAt, new Date(now.getTime() - ACCOUNT_ACTIVITY_DAYS * DAY_MS)),
                inArray(accountEvent.type, [...ACCOUNT_EVENT_TYPES]),
                before ? lt(accountEvent.createdAt, before) : undefined,
            ),
        )
        .orderBy(desc(accountEvent.createdAt))
        .limit(ACCOUNT_ACTIVITY_PAGE + 1);
    const page = rows.slice(0, ACCOUNT_ACTIVITY_PAGE);

    const sessionIds = page.map((r) => r.sessionId).filter((id): id is string => Boolean(id));
    const open = sessionIds.length
        ? await db
              .select({ id: sessionTable.id })
              .from(sessionTable)
              .where(and(eq(sessionTable.userId, userId), inArray(sessionTable.id, sessionIds), gte(sessionTable.expiresAt, now)))
        : [];
    const openIds = new Set(open.map((s) => s.id));

    return {
        items: page.map((r) => ({
            id: r.id,
            type: r.type as AccountEventType,
            at: r.createdAt.toISOString(),
            ipAddress: r.ipAddress,
            userAgent: r.userAgent,
            newDevice: r.newDevice,
            openSessionId: r.sessionId && openIds.has(r.sessionId) ? r.sessionId : null,
            current: Boolean(r.sessionId && r.sessionId === options.currentSessionId),
        })),
        next: rows.length > ACCOUNT_ACTIVITY_PAGE ? page[page.length - 1].createdAt.toISOString() : null,
    };
}

/** Signs out one of the person's own sessions. Returns whether there was one. */
export async function signOutOwnSession(userId: string, sessionId: string): Promise<boolean> {
    const deleted = await db
        .delete(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .returning({ id: sessionTable.id });
    return deleted.length > 0;
}

/** Cron: account history follows the sign-in event retention. */
export async function purgeAccountEvents(now: Date = new Date(), retentionDays: number = env.AUTH_EVENT_RETENTION_DAYS) {
    const deleted = await db
        .delete(accountEvent)
        .where(lt(accountEvent.createdAt, new Date(now.getTime() - retentionDays * DAY_MS)))
        .returning({ id: accountEvent.id });
    return deleted.length;
}
