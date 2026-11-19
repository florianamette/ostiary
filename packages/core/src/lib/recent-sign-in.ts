/**
 * Sensitive actions (adding a passkey, linking an account, creating an API key, exporting
 * one's data) need a sign-in from the last 10 minutes, measured from when the session was
 * created: Better Auth's own `freshAge` counts from the session's last refresh, which a stolen
 * cookie can trigger by itself.
 */
export const RECENT_SIGN_IN_SECONDS = 10 * 60;

/** Whether a session was created (signed in) within RECENT_SIGN_IN_SECONDS, as of `now`. */
export function signedInRecently(createdAt: Date | string, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() <= RECENT_SIGN_IN_SECONDS * 1000;
}

/** Seconds left before a session stops counting as a recent sign-in (0 once it has). */
export function recentSignInSecondsLeft(createdAt: Date | string, now: number = Date.now()): number {
  const elapsed = (now - new Date(createdAt).getTime()) / 1000;
  return Math.max(0, Math.floor(RECENT_SIGN_IN_SECONDS - elapsed));
}
