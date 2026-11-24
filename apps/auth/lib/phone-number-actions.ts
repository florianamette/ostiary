"use server";

import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { user } from "@ostiary/core/db/schema";

import { userActor } from "@/lib/server-session";

/**
 * Removes the account's phone number: no more texted sign-in codes. Adding or changing one
 * goes through Better Auth's /phone-number/verify (a code texted to the new number).
 */
export async function removeMyPhoneNumber(): Promise<{ ok: boolean }> {
  const actor = await userActor({ forbidImpersonation: true });
  if (!actor.ok) return { ok: false };
  await db.update(user).set({ phoneNumber: null, phoneNumberVerified: null, updatedAt: new Date() }).where(eq(user.id, actor.user.id));
  await actor.audit({ action: "user.remove_phone_number", target: { type: "user", id: actor.user.id, label: actor.user.email } });
  return { ok: true };
}
