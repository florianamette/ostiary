"use server";

import { disconnectApp, listConnectedApps, type ConnectedApp } from "@/lib/connected-apps";
import { userActor } from "@/lib/server-session";

/** The signed-in user's connected apps; null when signed out. */
export async function getMyConnectedApps(): Promise<ConnectedApp[] | null> {
  const actor = await userActor();
  return actor.ok ? listConnectedApps(actor.user.id) : null;
}

/**
 * Disconnects an app: its consent goes and its tokens are revoked. An admin viewing the account
 * cannot do it; the person's own change is in the audit log.
 */
export async function disconnectMyApp(clientId: string): Promise<{ ok: boolean }> {
  if (typeof clientId !== "string" || !clientId || clientId.length > 255) return { ok: false };
  const actor = await userActor({ forbidImpersonation: true });
  if (!actor.ok) return { ok: false };
  await disconnectApp(actor.user.id, clientId);
  await actor.audit({
    action: "oauth_consent.delete",
    target: { type: "oauth_client", id: clientId },
    metadata: { by: "self" },
  });
  return { ok: true };
}
