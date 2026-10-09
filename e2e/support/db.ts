import pg from "pg";

import { DATABASE_URL } from "./env";

/** Direct database access, for what tests cannot see through HTTP (and for test data). */
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}
