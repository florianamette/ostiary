import { and, count, desc, ilike, not, or, sql, type SQL } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { user } from "@ostiary/core/db/schema";
import { containsPattern } from "@/components/admin/common/list-params";

/**
 * True when the comma-separated `user.role` holds `role` ("user,admin" holds "admin"). An equality
 * test misses such users; this is the SQL counterpart of userHasAdminRole.
 */
export function userHasRoleSql(role: string): SQL {
  return sql`${role} = any(string_to_array(replace(coalesce(${user.role}, ''), ' ', ''), ','))`;
}

export type UserRoleFilter = "all" | "admin" | "user";

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
  search,
  role,
  limit,
  offset,
}: {
  search: string;
  role: UserRoleFilter;
  limit: number;
  offset: number;
}): Promise<{ rows: UserListRow[]; total: number }> {
  const pattern = search ? containsPattern(search) : null;
  const where = and(
    pattern ? or(ilike(user.email, pattern), ilike(user.name, pattern), ilike(user.username, pattern)) : undefined,
    role === "admin" ? userHasRoleSql("admin") : role === "user" ? not(userHasRoleSql("admin")) : undefined,
  );
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
