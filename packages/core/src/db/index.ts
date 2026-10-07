import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { env } from "@ostiary/core/lib/env";
import * as schema from "@ostiary/core/db/schema";

const globalForDb = globalThis as unknown as {
  pool: pg.Pool | undefined;
};

const pool =
  globalForDb.pool ??
  new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
