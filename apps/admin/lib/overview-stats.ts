import { count, desc, gte, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { user } from "@ostiary/core/db/schema";
import { userHasRoleSql } from "@/lib/user-list";

export type OverviewCounts = {
  totalUsers: number;
  admins: number;
  banned: number;
  verified: number;
  recent: number;
};

/** The overview's account counts, in one pass over the user table. */
export async function getOverviewCounts(): Promise<OverviewCounts> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      totalUsers: count(),
      admins: sql<number>`count(*) filter (where ${userHasRoleSql("admin")})`.mapWith(Number),
      banned: sql<number>`count(*) filter (where ${user.banned})`.mapWith(Number),
      verified: sql<number>`count(*) filter (where ${user.emailVerified})`.mapWith(Number),
      recent: sql<number>`count(*) filter (where ${gte(user.createdAt, since)})`.mapWith(Number),
    })
    .from(user);
  return row;
}

/** The newest accounts, for the overview. */
export async function getRecentUsers(limit = 8) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(limit);
}
