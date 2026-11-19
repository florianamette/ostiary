import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, lt, or } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { authEvent } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { ipAddressOptions, resolveClientIp } from "@ostiary/core/lib/rate-limit";

export type AuthEventType = "sign_in" | "sign_up" | "sign_out" | "sign_in_failed";

/** Records an auth event. Never throws: activity tracking must not break sign-in. */
export async function recordAuthEvent(
  type: AuthEventType,
  userId: string | null,
  extra: { identifier?: string | null; ipAddress?: string | null } = {},
): Promise<void> {
  try {
    await db.insert(authEvent).values({
      id: randomUUID(),
      type,
      userId,
      identifier: extra.identifier?.slice(0, 320) ?? null,
      ipAddress: extra.ipAddress ?? null,
    });
  } catch (error) {
    console.error("auth_event insert failed", error);
  }
}

/**
 * Failed sign-ins keep the email or username that was tried, often of someone without an
 * account, and the address it came from. The security page looks at the last 7 days and the
 * charts at the last 30, so after this they are cleared: the counts stay.
 */
export const FAILED_SIGN_IN_DETAILS_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Sign-in events are kept AUTH_EVENT_RETENTION_DAYS (default 90), then deleted, and failed
 * sign-ins lose what identifies a person after FAILED_SIGN_IN_DETAILS_DAYS. Run by the cron
 * route. Returns how many rows were deleted and cleared.
 */
export async function purgeAuthEvents(now: Date = new Date(), retentionDays: number = env.AUTH_EVENT_RETENTION_DAYS) {
  const deleted = await db
    .delete(authEvent)
    .where(lt(authEvent.createdAt, new Date(now.getTime() - retentionDays * DAY_MS)))
    .returning({ id: authEvent.id });
  const cleared = await db
    .update(authEvent)
    .set({ identifier: null, ipAddress: null })
    .where(
      and(
        eq(authEvent.type, "sign_in_failed"),
        lt(authEvent.createdAt, new Date(now.getTime() - FAILED_SIGN_IN_DETAILS_DAYS * DAY_MS)),
        or(isNotNull(authEvent.identifier), isNotNull(authEvent.ipAddress)),
      ),
    )
    .returning({ id: authEvent.id });
  return { deleted: deleted.length, cleared: cleared.length };
}

const ipOptions = ipAddressOptions(env);

/**
 * Client IP for the audit log and sign-in events: the address Better Auth uses for rate limits
 * and sessions (IP_ADDRESS_HEADERS, TRUSTED_PROXIES), see resolveClientIp.
 */
export function clientIp(headers: Headers | undefined | null): string | null {
  return resolveClientIp(headers, ipOptions);
}
