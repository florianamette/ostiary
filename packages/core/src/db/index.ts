import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";

import { env } from "@ostiary/core/lib/env";
import * as schema from "@ostiary/core/db/schema";
import { normalizeSslMode, RetryingPool } from "@ostiary/core/db/connection";

const globalForDb = globalThis as unknown as {
  pool: pg.Pool | undefined;
};

const pool =
  globalForDb.pool ??
  new RetryingPool({
    connectionString: normalizeSslMode(env.DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });

/** True when the database answers within `timeoutMs`. For the health endpoints. */
export async function databaseReachable(timeoutMs = 3_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([pool.query("select 1").then(() => true as const), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
