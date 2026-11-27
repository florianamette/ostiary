"use server";

import { listAccountActivity, recordAccountEvent, signOutOwnSession, type AccountActivityPage } from "@ostiary/core/lib/account-activity";
import { currentSession, userActor } from "@/lib/server-session";

/** A page of the signed-in person's recent activity (`before`: the previous page's `next`); null when signed out. */
export async function getMyActivity(before?: string | null): Promise<AccountActivityPage | null> {
  if (before !== undefined && before !== null && (typeof before !== "string" || before.length > 40)) return null;
  const actor = await userActor();
  if (!actor.ok) return null;
  return listAccountActivity(actor.user.id, { before, currentSessionId: actor.session.session.id });
}

/** Signs out one of the person's sessions from its sign-in row. An admin viewing the account cannot. */
export async function signOutMySession(sessionId: string): Promise<{ ok: boolean }> {
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 255) return { ok: false };
  const actor = await userActor({ forbidImpersonation: true });
  if (!actor.ok || sessionId === actor.session.session.id) return { ok: false };
  if (!(await signOutOwnSession(actor.user.id, sessionId))) return { ok: false };
  const { requestHeaders } = await currentSession();
  await recordAccountEvent("session_revoked", actor.user.id, { headers: requestHeaders });
  return { ok: true };
}
