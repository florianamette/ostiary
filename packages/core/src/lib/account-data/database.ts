import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "@ostiary/core/db/schema";

/**
 * Any Drizzle Postgres database with Ostiary's schema: the app's node-postgres pool, a
 * transaction, or the in-memory PGlite database the tests use.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
