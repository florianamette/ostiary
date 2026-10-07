"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { disconnectApp, listConnectedApps, type ConnectedApp } from "@/lib/connected-apps";

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** The signed-in user's connected apps; null when signed out. */
export async function getMyConnectedApps(): Promise<ConnectedApp[] | null> {
  const userId = await currentUserId();
  return userId ? listConnectedApps(userId) : null;
}

export async function disconnectMyApp(clientId: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId || !clientId) return { ok: false };
  await disconnectApp(userId, clientId);
  return { ok: true };
}
