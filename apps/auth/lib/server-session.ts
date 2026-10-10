import { headers } from "next/headers";

import { RECENT_SIGN_IN_SECONDS } from "@ostiary/core/lib/auth-factory";
import { auth } from "@/lib/auth";

/** The session of the request, with its headers (for the audit log's IP address). */
export async function currentSession() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { session, requestHeaders };
}

/** Whether a session started within the recent sign-in window (sensitive actions need it). */
export function signedInRecently(createdAt: Date | string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= RECENT_SIGN_IN_SECONDS * 1000;
}
