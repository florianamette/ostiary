"use server";

import { and, eq, like } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { session, twoFactor, user, verification } from "@ostiary/core/db/schema";
import { accountExportFileName, buildAccountExport } from "@ostiary/core/lib/account-data/export";
import { env } from "@ostiary/core/lib/env";
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

/**
 * Turns off two-factor authentication for a user who lost their authenticator and backup
 * codes. They sign in with their password alone and can set it up again from their account.
 */
export async function resetUserTwoFactor(userId: string): Promise<{ ok: boolean }> {
  const { audit, session: adminSession } = await adminActor();
  // Admins manage their own 2FA from their account page.
  if (userId === adminSession.user.id) return { ok: false };
  const reset = await db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(and(eq(user.id, userId), eq(user.twoFactorEnabled, true)))
      .returning({ email: user.email });
    if (updated.length === 0) return null;
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    // Trusted devices would otherwise skip the code once 2FA is turned back on.
    await tx
      .delete(verification)
      .where(and(like(verification.identifier, "trust-device-%"), eq(verification.value, userId)));
    return updated[0]!;
  });
  if (!reset) return { ok: false };
  await audit({
    action: "user.reset_two_factor",
    target: { type: "user", id: userId, label: reset.email },
  });
  return { ok: true };
}

/**
 * Everything Ostiary holds about a user, the same document as their own "Download my data",
 * for answering an access request made another way (email, letter). Audited.
 */
export async function exportUserData(userId: string): Promise<{ ok: true; fileName: string; json: string } | { ok: false }> {
  const { audit } = await adminActor();
  const now = new Date();
  const data = await buildAccountExport(db, userId, { instance: env.AUTH_APP_URL ?? null, now });
  if (!data) return { ok: false };
  await audit({
    action: "user.export_data",
    target: { type: "user", id: userId, label: data.profile.email },
    metadata: { by: "admin" },
  });
  return { ok: true, fileName: accountExportFileName(userId, now), json: JSON.stringify(data, null, 2) };
}
