"use client";

import { authClient } from "@/lib/auth-client";

/**
 * Sensitive actions (adding a passkey, connecting an account) need a recent sign-in. Signs
 * out and sends the user to the login page, returning to the dashboard's security section.
 */
export async function signInAgain(locale: string) {
  await authClient.signOut();
  const back = `/${locale}/dashboard#security`;
  window.location.href = `/${locale}/login?callbackURL=${encodeURIComponent(back)}`;
}

/** True for the errors returned when an action needs a more recent sign-in. */
export function needsRecentSignIn(err: unknown): boolean {
  const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: string }).code : undefined;
  return code === "RECENT_SIGN_IN_REQUIRED" || code === "SESSION_NOT_FRESH";
}
