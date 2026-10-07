import { randomUUID } from "node:crypto";

import { db } from "@ostiary/core/db/index";
import { authEvent } from "@ostiary/core/db/schema";

export type AuthEventType = "sign_in" | "sign_up" | "sign_out" | "sign_in_failed";

/** Records an auth event. Never throws: activity tracking must not break sign-in. */
export async function recordAuthEvent(
  type: AuthEventType,
  userId: string | null,
  extra: { identifier?: string | null; ipAddress?: string | null } = {},
): Promise<void> {
  try {
    await db.insert(authEvent).values({
      id: randomUUID(),
      type,
      userId,
      identifier: extra.identifier?.slice(0, 320) ?? null,
      ipAddress: extra.ipAddress ?? null,
    });
  } catch (error) {
    console.error("auth_event insert failed", error);
  }
}

/** Client IP from the proxy headers Vercel sets. */
export function clientIp(headers: Headers | undefined | null): string | null {
  const forwarded = headers?.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers?.get("x-real-ip") ?? null;
}
