import type { JwtOptions } from "better-auth/plugins";

/*
 * Signing keys: the key pairs Better Auth's jwt plugin uses to sign ID tokens and JWT access
 * tokens, published at /jwks. How Better Auth 1.7 handles them:
 *
 * - The newest key that has not expired signs every token. When none is left, the next token
 *   creates a new key (`createJwk`), with `expiresAt = now + jwks.rotationInterval` when an
 *   interval is set, otherwise no expiry. That is the whole of automatic rotation: it is lazy
 *   and it only applies to keys created after the interval was set.
 * - The JWKS endpoint publishes every key until `expiresAt + jwks.gracePeriod`, so tokens
 *   signed with a retired key keep verifying. Keys without `expiresAt` are published forever.
 * - Both options are read from the plugin's options object on every call.
 *
 * This file holds the pure policy (settings, key status, the expiry to give live keys when
 * the interval changes) so it can be tested without a database.
 */

const DAY_SECONDS = 24 * 60 * 60;

/** Choices offered in the admin console. 0 = no automatic rotation (Better Auth's default). */
export const ROTATION_INTERVAL_DAYS = [0, 30, 90, 180, 365] as const;
/**
 * Longer than any token Ostiary signs (access tokens 1 hour, ID tokens 10 hours, the jwt
 * plugin's /token 15 minutes), so a token never outlives the key that verifies it.
 */
export const GRACE_PERIOD_DAYS = [1, 7, 30, 90] as const;

export type SigningKeySettings = {
  /** Days a key signs tokens before a new one replaces it. 0: never (until rotated by hand). */
  rotationIntervalDays: number;
  /** Days a retired key stays in the JWKS, so tokens it signed keep verifying. */
  gracePeriodDays: number;
};

/** Rotation off and Better Auth's 30-day grace period: what deployments had before. */
export const DEFAULT_SIGNING_KEY_SETTINGS: SigningKeySettings = {
  rotationIntervalDays: 0,
  gracePeriodDays: 30,
};

const MAX_ROTATION_DAYS = 3650;
const MAX_GRACE_DAYS = 365;

function wholeDays(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/**
 * Reads the stored settings, falling back to the defaults field by field, so a document
 * written by an older or newer version never turns rotation on by accident.
 */
export function parseSigningKeySettings(raw: unknown): SigningKeySettings {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const defaults = DEFAULT_SIGNING_KEY_SETTINGS;
  return {
    rotationIntervalDays: wholeDays(value.rotationIntervalDays, 0, MAX_ROTATION_DAYS) ?? defaults.rotationIntervalDays,
    gracePeriodDays: wholeDays(value.gracePeriodDays, 1, MAX_GRACE_DAYS) ?? defaults.gracePeriodDays,
  };
}

/** Writes the settings into the jwt plugin's options, in seconds as Better Auth expects. */
export function applySigningKeySettings(options: JwtOptions, settings: SigningKeySettings) {
  const jwks = (options.jwks ??= {});
  jwks.rotationInterval = settings.rotationIntervalDays > 0 ? settings.rotationIntervalDays * DAY_SECONDS : undefined;
  jwks.gracePeriod = settings.gracePeriodDays * DAY_SECONDS;
}

/**
 * When a live key (one still signing) should retire under a new interval. Better Auth only
 * sets `expiresAt` when it creates a key, so changing the interval updates live keys too:
 * created + interval, but never in the past (a key retired with a past date would leave the
 * JWKS before its grace period, while tokens it just signed are still in use). No interval:
 * no expiry.
 */
export function liveKeyExpiry(createdAt: Date, settings: SigningKeySettings, now = new Date()): Date | null {
  if (settings.rotationIntervalDays <= 0) return null;
  const expiry = createdAt.getTime() + settings.rotationIntervalDays * DAY_SECONDS * 1000;
  return new Date(Math.max(expiry, now.getTime()));
}

/**
 * - current: signs new tokens.
 * - published: retired (or a spare live key), still in the JWKS so its tokens verify.
 * - expired: past its grace period, no longer in the JWKS.
 */
export type SigningKeyStatus = "current" | "published" | "expired";

export type SigningKeyRow = {
  id: string;
  alg: string | null;
  crv: string | null;
  createdAt: Date;
  expiresAt: Date | null;
};

export type SigningKeyView = SigningKeyRow & {
  alg: string;
  status: SigningKeyStatus;
  /** When the key leaves the JWKS; null while it has no expiry. */
  unpublishedAt: Date | null;
};

/** Ostiary uses Better Auth's default key type. */
export const SIGNING_ALGORITHM = "EdDSA";

/**
 * Status of every key, newest first. The current key is the one Better Auth picks: the
 * newest live key with the configured algorithm, else the newest live key.
 */
export function describeSigningKeys(
  rows: SigningKeyRow[],
  settings: SigningKeySettings,
  now = new Date(),
): SigningKeyView[] {
  const graceMs = settings.gracePeriodDays * DAY_SECONDS * 1000;
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const live = sorted.filter((row) => !row.expiresAt || row.expiresAt > now);
  const current = live.find((row) => (row.alg ?? SIGNING_ALGORITHM) === SIGNING_ALGORITHM) ?? live[0];
  return sorted.map((row) => {
    const unpublishedAt = row.expiresAt ? new Date(row.expiresAt.getTime() + graceMs) : null;
    const status: SigningKeyStatus =
      row === current ? "current" : !unpublishedAt || unpublishedAt > now ? "published" : "expired";
    return { ...row, alg: row.alg ?? SIGNING_ALGORITHM, status, unpublishedAt };
  });
}
