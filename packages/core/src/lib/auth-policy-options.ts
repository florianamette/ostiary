/*
 * The session and password policy's choices, defaults and parsing: no database, so the admin
 * console's client components can import it. Loading, saving and applying: auth-policy.ts.
 */

export const DAY_SECONDS = 24 * 60 * 60;

/** Choices offered in the console. */
export const SESSION_DAYS = [1, 7, 14, 30, 90] as const;
export const MIN_PASSWORD_LENGTHS = [8, 10, 12, 14, 16] as const;
/** Days people have to turn on two-factor authentication once it is required. */
export const TWO_FACTOR_GRACE_DAYS = [0, 7, 14, 30] as const;
/** Wrong passwords for one email or username that lock its password sign-in (0: never). */
export const LOCKOUT_ATTEMPTS = [0, 5, 10, 20] as const;
/** The wrong passwords count over this many minutes, and the lock lasts as long. */
export const LOCKOUT_MINUTES = 15;

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
  /**
   * Everyone must use two-factor authentication (an authenticator app, or a passkey) to sign in
   * to apps. Admins: REQUIRE_ADMIN_2FA. Organizations can require it for their members.
   */
  twoFactorEveryone: boolean;
  /** Days to turn it on, from when it became required (or the account was created, if later). */
  twoFactorGraceDays: number;
  /** When `twoFactorEveryone` was turned on (ISO date), set by the save. */
  twoFactorRequiredSince: string | null;
  /** Email people when their account signs in from a browser it has not used before. */
  newDeviceEmail: boolean;
  /** Email people when their password, two-factor authentication or passkeys change. */
  securityChangeEmail: boolean;
  /** Wrong passwords within LOCKOUT_MINUTES that lock password sign-in for that email or username, 0: never (security/sign-in-lockout.ts). */
  lockoutAttempts: number;
};

/** Better Auth's defaults, and Ostiary's behaviour before the policy existed. */
export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  sessionDays: 7,
  extendSessions: true,
  signOutOnPasswordChange: false,
  minPasswordLength: 8,
  passwordSignUp: true,
  twoFactorEveryone: false,
  twoFactorGraceDays: 14,
  twoFactorRequiredSince: null,
  newDeviceEmail: true,
  securityChangeEmail: true,
  lockoutAttempts: 10,
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
    twoFactorEveryone: bool("twoFactorEveryone"),
    twoFactorGraceDays: oneOf<number>(TWO_FACTOR_GRACE_DAYS, value.twoFactorGraceDays, DEFAULT_AUTH_POLICY.twoFactorGraceDays),
    twoFactorRequiredSince:
      typeof value.twoFactorRequiredSince === "string" && !Number.isNaN(Date.parse(value.twoFactorRequiredSince))
        ? value.twoFactorRequiredSince
        : null,
    newDeviceEmail: bool("newDeviceEmail"),
    securityChangeEmail: bool("securityChangeEmail"),
    lockoutAttempts: oneOf<number>(LOCKOUT_ATTEMPTS, value.lockoutAttempts, DEFAULT_AUTH_POLICY.lockoutAttempts),
  };
}
