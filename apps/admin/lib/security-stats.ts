import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { authEvent, user } from "@ostiary/core/db/schema";

const DAY = 24 * 3600 * 1000;
const failed = eq(authEvent.type, "sign_in_failed");

export type FailedDay = { date: string; failed: number };

export async function getSecurityStats() {
  const now = Date.now();
  const since = (ms: number) => gte(authEvent.createdAt, new Date(now - ms));
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 29);

  // Days in UTC, whatever the database session's time zone (created_at is timestamptz).
  const day = sql<string>`to_char(date_trunc('day', ${authEvent.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
  // The same email or username typed in another case is one account.
  const identifier = sql<string>`lower(${authEvent.identifier})`;
  const [last24h, last7d, last30d, perDay, topIdentifiers, topIps, banned] = await Promise.all([
    db.select({ n: count() }).from(authEvent).where(and(failed, since(DAY))),
    db.select({ n: count() }).from(authEvent).where(and(failed, since(7 * DAY))),
    db.select({ n: count() }).from(authEvent).where(and(failed, gte(authEvent.createdAt, start))),
    db.select({ day, n: count() }).from(authEvent).where(and(failed, gte(authEvent.createdAt, start))).groupBy(day),
    db
      .select({ identifier, n: count(), last: sql<Date>`max(${authEvent.createdAt})`.mapWith(authEvent.createdAt) })
      .from(authEvent)
      .where(and(failed, since(7 * DAY), isNotNull(authEvent.identifier)))
      .groupBy(identifier)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ ip: authEvent.ipAddress, n: count(), accounts: sql<number>`count(distinct ${identifier})` })
      .from(authEvent)
      .where(and(failed, since(7 * DAY), isNotNull(authEvent.ipAddress)))
      .groupBy(authEvent.ipAddress)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ id: user.id, name: user.name, email: user.email, reason: user.banReason, expires: user.banExpires })
      .from(user)
      .where(eq(user.banned, true))
      .limit(50),
  ]);

  const counts = new Map(perDay.map((r) => [r.day, r.n]));
  const series: FailedDay[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, failed: counts.get(key) ?? 0 });
  }

  return {
    totals: { last24h: last24h[0]?.n ?? 0, last7d: last7d[0]?.n ?? 0, last30d: last30d[0]?.n ?? 0 },
    series,
    topIdentifiers,
    topIps: topIps.map((r) => ({ ...r, accounts: Number(r.accounts) })),
    banned,
  };
}
