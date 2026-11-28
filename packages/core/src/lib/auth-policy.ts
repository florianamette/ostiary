import { readAppSetting, writeAppSetting } from "@ostiary/core/lib/app-settings";
import { refreshingCache } from "@ostiary/core/lib/refreshing-cache";
import {
  DAY_SECONDS,
  DEFAULT_AUTH_POLICY,
  parseAuthPolicy,
  SHORT_SESSION_SECONDS,
  UPDATE_AGE_SECONDS,
  type AuthPolicy,
} from "@ostiary/core/lib/auth-policy-options";

/*
 * Session and password policy, set from the admin console (Security). Better Auth fixes these
 * when it starts; Ostiary writes them into its context on each request instead (syncAuthPolicy,
 * from the request guards), and sets a new session's expiry in the session create hook, the one
 * value Better Auth reads only at start-up.
 */

export {
  DEFAULT_AUTH_POLICY,
  LOCKOUT_ATTEMPTS,
  MIN_PASSWORD_LENGTHS,
  parseAuthPolicy,
  SESSION_DAYS,
  TWO_FACTOR_GRACE_DAYS,
  type AuthPolicy,
} from "@ostiary/core/lib/auth-policy-options";

const SETTINGS_KEY = "auth_policy";

export async function loadAuthPolicy(): Promise<AuthPolicy> {
  return parseAuthPolicy(await readAppSetting(SETTINGS_KEY));
}

/** Each instance reloads it at most once a minute. */
const policyCache = refreshingCache({
  globalKey: "__ostiaryAuthPolicy",
  refreshMs: 60_000,
  initial: DEFAULT_AUTH_POLICY,
  load: loadAuthPolicy,
  loadError: "Could not load the session and password policy",
});

export function currentAuthPolicy(): Promise<AuthPolicy> {
  return policyCache.get();
}

/**
 * Saves the policy. Turning "two-factor for everyone" on starts its grace period now; keeping it
 * on keeps the start.
 */
export async function saveAuthPolicy(
  policy: Omit<AuthPolicy, "twoFactorRequiredSince">,
  updatedBy: string | null,
  previous: AuthPolicy = DEFAULT_AUTH_POLICY,
): Promise<AuthPolicy> {
  const saved: AuthPolicy = {
    ...policy,
    twoFactorRequiredSince: policy.twoFactorEveryone
      ? (previous.twoFactorEveryone && previous.twoFactorRequiredSince) || new Date().toISOString()
      : null,
  };
  await writeAppSetting(SETTINGS_KEY, saved, updatedBy);
  policyCache.invalidate();
  return saved;
}

/** The parts of Better Auth's context the policy changes. */
export type PolicyContext = {
  sessionConfig: { expiresIn: number; updateAge: number };
  password: { config: { minPasswordLength: number } };
  options: { emailAndPassword?: { disableSignUp?: boolean } };
};

/** Writes the policy into Better Auth's context (once per request). */
export function applyAuthPolicy(context: PolicyContext, policy: AuthPolicy) {
  const expiresIn = policy.sessionDays * DAY_SECONDS;
  context.sessionConfig.expiresIn = expiresIn;
  // A session never refreshed ends `expiresIn` after it started.
  context.sessionConfig.updateAge = policy.extendSessions ? Math.min(UPDATE_AGE_SECONDS, expiresIn) : expiresIn + DAY_SECONDS;
  context.password.config.minPasswordLength = policy.minPasswordLength;
  if (context.options.emailAndPassword) context.options.emailAndPassword.disableSignUp = !policy.passwordSignUp;
}

export async function syncAuthPolicy(context: PolicyContext): Promise<AuthPolicy> {
  const policy = await currentAuthPolicy();
  applyAuthPolicy(context, policy);
  return policy;
}

/**
 * The expiry of a new session under the policy. Better Auth computes it from the lifetime it
 * started with; a session without "remember me" keeps its one day, or less.
 */
export function policySessionExpiry(proposed: Date, policy: AuthPolicy, now = new Date()): Date {
  const proposedSeconds = (proposed.getTime() - now.getTime()) / 1000;
  const policySeconds = policy.sessionDays * DAY_SECONDS;
  const seconds = proposedSeconds <= SHORT_SESSION_SECONDS + 60 ? Math.min(proposedSeconds, policySeconds) : policySeconds;
  return new Date(now.getTime() + seconds * 1000);
}
