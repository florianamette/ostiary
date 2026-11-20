import { and, count, desc, eq, ilike, not, or, sql, type SQL } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { authEvent, user } from "@ostiary/core/db/schema";
import { containsPattern, readChoice, readParam, type ListSearchParams } from "@/components/admin/common/list-params";

/**
 * True when the comma-separated `user.role` holds `role` ("user,admin" holds "admin"). An equality
 * test misses such users; this is the SQL counterpart of userHasAdminRole.
 */
export function userHasRoleSql(role: string): SQL {
  return sql`${role} = any(string_to_array(replace(coalesce(${user.role}, ''), ' ', ''), ','))`;
}

export type UserRoleFilter = "all" | "admin" | "user";

const ROLE_FILTERS: readonly UserRoleFilter[] = ["all", "admin", "user"];

/** The users list's search and role filter. */
export type UserListFilters = { search: string; role: UserRoleFilter };

/** The filters in the users page's URL (`?q=`, `?role=`), shared by the page and its CSV export. */
export function readUserListFilters(query: ListSearchParams): UserListFilters {
  return { search: readParam(query, "q"), role: readChoice(query, "role", ROLE_FILTERS, "all") };
}

function userListWhere({ search, role }: UserListFilters): SQL | undefined {
  const pattern = search ? containsPattern(search) : null;
  return and(
    pattern ? or(ilike(user.email, pattern), ilike(user.name, pattern), ilike(user.username, pattern)) : undefined,
    role === "admin" ? userHasRoleSql("admin") : role === "user" ? not(userHasRoleSql("admin")) : undefined,
  );
}

export type UserListRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  emailVerified: boolean;
  createdAt: Date;
};

/** One page of the users list, newest first, with the number of matching users. */
export async function listUsers({
  limit,
  offset,
  ...filters
}: UserListFilters & {
  limit: number;
  offset: number;
}): Promise<{ rows: UserListRow[]; total: number }> {
  const where = userListWhere(filters);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(user).where(where),
  ]);
  return { rows, total };
}

/**
 * The columns of the users CSV export. No password hash, two-factor secret or token: those live
 * in other tables (account, two_factor, session) and are never read here.
 */
export const USER_EXPORT_COLUMNS = [
  "id",
  "email",
  "name",
  "username",
  "role",
  "emailVerified",
  "banned",
  "banReason",
  "banExpires",
  "twoFactorEnabled",
  "createdAt",
  "updatedAt",
  "lastSignInAt",
] as const;

/**
 * Every user matching the filters, in the list's order (newest first), `batchSize` at a time.
 * Keyset pagination on (created_at, id), the cursor kept as Postgres text so no microseconds
 * are lost to a JavaScript Date. `lastSignInAt` is the latest sign-in event still kept
 * (AUTH_EVENT_RETENTION_DAYS), read through the (user_id, created_at) index.
 */
export async function* userExportBatches(filters: UserListFilters, batchSize: number) {
  const where = userListWhere(filters);
  const lastSignIn = db
    .select({ at: sql`max(${authEvent.createdAt})` })
    .from(authEvent)
    .where(and(eq(authEvent.userId, user.id), eq(authEvent.type, "sign_in")));
  let cursor: { createdAt: string; id: string } | null = null;
  for (;;) {
    const after: SQL | undefined = cursor
      ? sql`(${user.createdAt}, ${user.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id})`
      : undefined;
    const rows = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role,
        emailVerified: user.emailVerified,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSignInAt: sql<Date | null>`(${lastSignIn})`.mapWith(user.createdAt),
        cursor: sql<string>`${user.createdAt}::text`,
      })
      .from(user)
      .where(and(where, after))
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(batchSize);
    if (rows.length === 0) return;
    yield rows.map((row) => USER_EXPORT_COLUMNS.map((column) => row[column]));
    if (rows.length < batchSize) return;
    const last: { cursor: string; id: string } = rows[rows.length - 1];
    cursor = { createdAt: last.cursor, id: last.id };
  }
}
