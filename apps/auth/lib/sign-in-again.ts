"use client";

import { addAccountHref } from "@ostiary/core/lib/device-accounts";

/**
 * Sensitive actions (adding a passkey, connecting an account) need a recent sign-in. Sends the
 * user to the login page, returning to the dashboard's security section. The new sign-in
 * replaces this account's session; other accounts signed in on this browser stay signed in.
 */
export function signInAgain(locale: string) {
  const back = `/${locale}/dashboard#security`;
  window.location.href = addAccountHref(locale, new URLSearchParams({ callbackURL: back }));
}

/** True for the errors returned when an action needs a more recent sign-in. */
export function needsRecentSignIn(err: unknown): boolean {
  const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: string }).code : undefined;
  return code === "RECENT_SIGN_IN_REQUIRED" || code === "SESSION_NOT_FRESH";
}
