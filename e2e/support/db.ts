import pg from "pg";

import { DATABASE_URL } from "./env";

/** Direct database access, for what tests cannot see through HTTP (and for test data). */
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

/** Deletes a user by email, so a fixed address (ADMIN_EMAILS) can be signed up again. */
export async function deleteUser(email: string) {
  await query(`delete from "user" where email = $1`, [email]);
}

export async function userIdOf(email: string): Promise<string> {
  const [row] = await query<{ id: string }>(`select id from "user" where email = $1`, [email]);
  return row!.id;
}
