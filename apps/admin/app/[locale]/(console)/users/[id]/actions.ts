"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { session, user } from "@ostiary/core/db/schema";
import { adminActor } from "@/lib/admin-audit";

async function userLabel(userId: string) {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  return row?.email ?? null;
}

/** Signs the user out of one device. */
export async function revokeUserSession(userId: string, sessionId: string): Promise<{ ok: boolean }> {
  const { audit } = await adminActor();
  const deleted = await db
    .delete(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
    .returning({ id: session.id });
  if (deleted.length === 0) return { ok: false };
  await audit({
    action: "user.revoke_session",
    target: { type: "user", id: userId, label: await userLabel(userId) },
  });
  return { ok: true };
}

/** Signs the user out everywhere. */
export async function revokeAllUserSessions(userId: string): Promise<{ ok: boolean; count: number }> {
  const { audit, session: adminSession } = await adminActor();
  if (userId === adminSession.user.id) return { ok: false, count: 0 };
  const deleted = await db.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
  await audit({
    action: "user.revoke_all_sessions",
    target: { type: "user", id: userId, label: await userLabel(userId) },
    metadata: { sessions: deleted.length },
  });
  return { ok: true, count: deleted.length };
}
