/*
 * The session and password policy's choices, defaults and parsing: no database, so the admin
 * console's client components can import it. Loading, saving and applying: auth-policy.ts.
 */

export const DAY_SECONDS = 24 * 60 * 60;

/** Choices offered in the console. */
export const SESSION_DAYS = [1, 7, 14, 30, 90] as const;
export const MIN_PASSWORD_LENGTHS = [8, 10, 12, 14, 16] as const;

export type AuthPolicy = {
  /** Days a session lasts: without use (sessions extended while used), or in all. */
  sessionDays: number;
  /** Sessions are extended while in use (Better Auth's default), or end after `sessionDays`. */
  extendSessions: boolean;
  /** Changing a password signs the account out everywhere else, whatever the form asked. */
  signOutOnPasswordChange: boolean;
  minPasswordLength: number;
  /** People may sign up with an email and a password. Off: social sign-in and SSO only. */
  passwordSignUp: boolean;
};

/** Better Auth's defaults, and Ostiary's behaviour before the policy existed. */
export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  sessionDays: 7,
  extendSessions: true,
  signOutOnPasswordChange: false,
  minPasswordLength: 8,
  passwordSignUp: true,
};

/** Better Auth refreshes a used session once a day (its default `updateAge`). */
export const UPDATE_AGE_SECONDS = DAY_SECONDS;
/** Sessions without "remember me" last a day (Better Auth's `dontRememberMe`). */
export const SHORT_SESSION_SECONDS = DAY_SECONDS;

function oneOf<T>(choices: readonly T[], value: unknown, fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

/** The stored policy, field by field, falling back to the defaults. */
export function parseAuthPolicy(raw: unknown): AuthPolicy {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof AuthPolicy) =>
    typeof value[key] === "boolean" ? (value[key] as boolean) : (DEFAULT_AUTH_POLICY[key] as boolean);
  return {
    sessionDays: oneOf<number>(SESSION_DAYS, value.sessionDays, DEFAULT_AUTH_POLICY.sessionDays),
    extendSessions: bool("extendSessions"),
    signOutOnPasswordChange: bool("signOutOnPasswordChange"),
    minPasswordLength: oneOf<number>(MIN_PASSWORD_LENGTHS, value.minPasswordLength, DEFAULT_AUTH_POLICY.minPasswordLength),
    passwordSignUp: bool("passwordSignUp"),
  };
}
