"use server";

import { and, eq, like } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { account, session, twoFactor, user, verification } from "@ostiary/core/db/schema";
import { accountExportFileName, buildAccountExport } from "@ostiary/core/lib/account-data/export";
import { env } from "@ostiary/core/lib/env";
import { clearPasswordBreach, passwordChangeRequired, requirePasswordChange } from "@ostiary/core/lib/security/password-breach";
import { z } from "zod";

import { adminAction, input, type AdminActor } from "@/lib/admin-action";

const userInput = z.tuple([input.id]);
const requireInput = z.tuple([input.id, z.boolean()]);

async function userLabel(userId: string) {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  return row?.email ?? null;
}

/** Signs the user out of one device. */
export async function revokeUserSession(userId: string, sessionId: string): Promise<{ ok: boolean }> {
  return adminAction(z.tuple([input.id, input.id]), [userId, sessionId], ([userId, sessionId], actor) => revokeUserSessionRun(userId, sessionId, actor));
}

async function revokeUserSessionRun(userId: string, sessionId: string, actor: AdminActor): Promise<{ ok: boolean }> {
  const { audit } = actor;
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
  return adminAction(userInput, [userId], ([userId], actor) => revokeAllUserSessionsRun(userId, actor), () => ({ ok: false, count: 0 }));
}

async function revokeAllUserSessionsRun(userId: string, actor: AdminActor): Promise<{ ok: boolean; count: number }> {
  const { audit, session: adminSession } = actor;
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
  return adminAction(userInput, [userId], ([userId], actor) => resetUserTwoFactorRun(userId, actor));
}

async function resetUserTwoFactorRun(userId: string, actor: AdminActor): Promise<{ ok: boolean }> {
  const { audit, session: adminSession } = actor;
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
  return adminAction(userInput, [userId], ([userId], actor) => exportUserDataRun(userId, actor));
}

async function exportUserDataRun(userId: string, actor: AdminActor): Promise<{ ok: true; fileName: string; json: string } | { ok: false }> {
  const { audit } = actor;
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

/**
 * "Require a password change": the user's next sign-in, and any page of the account they have
 * open, stops at /change-password until they choose a new password (security/password-breach.ts).
 * `required: false` cancels an admin's request (not a breached password). Only for accounts with a password, and not the admin's own.
 */
export async function setPasswordChangeRequired(userId: string, required: boolean): Promise<{ ok: boolean }> {
  return adminAction(requireInput, [userId, required], ([userId, required], actor) => setPasswordChangeRequiredRun(userId, required, actor));
}

async function setPasswordChangeRequiredRun(userId: string, required: boolean, actor: AdminActor): Promise<{ ok: boolean }> {
  const { audit, session: adminSession } = actor;
  if (userId === adminSession.user.id) return { ok: false };
  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  if (!credential) return { ok: false };
  if (required) {
    await requirePasswordChange(userId);
  } else {
    // A breached password must still change; only an admin's own request is cancelled.
    if ((await passwordChangeRequired(userId)) !== "admin") return { ok: false };
    await clearPasswordBreach(userId);
  }
  await audit({
    action: required ? "user.require_password_change" : "user.cancel_password_change",
    target: { type: "user", id: userId, label: await userLabel(userId) },
  });
  return { ok: true };
}
