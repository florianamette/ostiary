import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { rateLimit } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { TooManyRequestsError } from "@ostiary/core/lib/errors";
import { rateLimitOptions } from "@ostiary/core/lib/rate-limit";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

/**
 * The counter's key: the admin and their IP. The IP is the one Better Auth uses
 * (IP_ADDRESS_HEADERS, TRUSTED_PROXIES), never a raw `x-forwarded-for` a client could change on
 * every request; without one, the admin alone.
 */
export function adminWriteRateLimitKey(actorId: string, ip: string | null): string {
  return `admin-write|${actorId}|${ip ?? "-"}`;
}

/**
 * Limits writes through the admin API routes to MAX_REQUESTS_PER_WINDOW a minute per admin and
 * IP. Counted in Postgres (`rate_limit`, next to Better Auth's own counters, which clean up idle
 * rows), so the limit holds across serverless instances. On whenever Better Auth's rate limits
 * are (RATE_LIMIT_ENABLED, on in production by default).
 */
export async function assertAdminWriteRateLimit(actorId: string, ip: string | null): Promise<void> {
  if (!rateLimitOptions(env).enabled) return;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const [row] = await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key: adminWriteRateLimitKey(actorId, ip), count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      // A new window once the last one is over, else one more in this one. The window starts
      // at the first request, so `last_request` holds that start.
      set: {
        count: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} <= ${windowStart} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count });
  if ((row?.count ?? 0) > MAX_REQUESTS_PER_WINDOW) throw new TooManyRequestsError();
}
