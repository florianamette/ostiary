import { randomUUID } from "node:crypto";

import { db } from "@ostiary/core/db/index";
import { authEvent } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { ipAddressOptions, resolveClientIp } from "@ostiary/core/lib/rate-limit";

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

const ipOptions = ipAddressOptions(env);

/**
 * Client IP for the audit log and sign-in events: the address Better Auth uses for rate limits
 * and sessions (IP_ADDRESS_HEADERS, TRUSTED_PROXIES), see resolveClientIp.
 */
export function clientIp(headers: Headers | undefined | null): string | null {
  return resolveClientIp(headers, ipOptions);
}
