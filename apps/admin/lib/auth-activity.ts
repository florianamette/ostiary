import { and, count, gte, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { authEvent } from "@ostiary/core/db/schema";

export type AuthActivityDay = {
  /** ISO date, e.g. 2026-10-06 */
  date: string;
  signIns: number;
  signUps: number;
  signOuts: number;
};

/** Daily sign-in, sign-up and sign-out counts for the last `days` days, oldest first, gaps as zero. */
export async function getAuthActivity(days = 30): Promise<AuthActivityDay[]> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const day = sql<string>`to_char(date_trunc('day', ${authEvent.createdAt}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, type: authEvent.type, n: count() })
    .from(authEvent)
    .where(and(gte(authEvent.createdAt, start)))
    .groupBy(day, authEvent.type);

  const byDay = new Map<string, AuthActivityDay>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, signIns: 0, signUps: 0, signOuts: 0 });
  }
  for (const row of rows) {
    const entry = byDay.get(row.day);
    if (!entry) continue;
    if (row.type === "sign_in") entry.signIns = row.n;
    else if (row.type === "sign_up") entry.signUps = row.n;
    else entry.signOuts = row.n;
  }
  return [...byDay.values()];
}
