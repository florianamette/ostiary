import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@ostiary/core/db/index";
import { deviceCode } from "@ostiary/core/db/schema";
import { verifyAppContext, type VerifiedAppContext } from "@ostiary/core/lib/app-branding/context";
import { resolveAuthScreenApp, type AuthScreenApp } from "@ostiary/core/lib/app-branding/store";
import { normalizeUserCode } from "@ostiary/core/lib/device-code";
import { env } from "@ostiary/core/lib/env";
import { auth } from "@/lib/auth";

export type { AuthScreenApp };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The app a sign-in screen is for, from the page's query: a signed OAuth request or an app
 * context token (see lib/app-branding/context.ts). Null keeps the default look.
 */
export async function authScreenApp(searchParams: SearchParams): Promise<AuthScreenApp | null> {
  const context = verifyAppContext(searchParams, env.BETTER_AUTH_SECRET);
  return context ? resolveAuthScreenApp(context, env.BETTER_AUTH_SECRET) : null;
}

/**
 * The app of a device sign-in, once the code in `?user_code=` names a pending request that is
 * not bound to another account. Only admin-registered clients can start one (auth-factory).
 */
export async function deviceScreenApp(searchParams: SearchParams): Promise<AuthScreenApp | null> {
  const raw = searchParams.user_code;
  const userCode = normalizeUserCode(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""));
  if (!userCode) return null;
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session) return null;
  const [row] = await db
    .select({ clientId: deviceCode.clientId, userId: deviceCode.userId })
    .from(deviceCode)
    .where(and(eq(deviceCode.userCode, userCode), eq(deviceCode.status, "pending"), gt(deviceCode.expiresAt, new Date())))
    .limit(1)
    .catch(() => []);
  if (!row?.clientId || (row.userId && row.userId !== session.user.id)) return null;
  const context: VerifiedAppContext = {
    clientId: row.clientId,
    authorizeQuery: new URLSearchParams({ client_id: row.clientId }).toString(),
    source: "token",
  };
  return resolveAuthScreenApp(context, env.BETTER_AUTH_SECRET);
}
