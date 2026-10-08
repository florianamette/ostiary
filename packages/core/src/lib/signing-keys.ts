import { createJwk, type JwtOptions } from "better-auth/plugins";
import { and, desc, eq, gt, isNull, ne, or } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { appSetting, jwks } from "@ostiary/core/db/schema";
import {
  applySigningKeySettings,
  DEFAULT_SIGNING_KEY_SETTINGS,
  liveKeyExpiry,
  parseSigningKeySettings,
  type SigningKeyRow,
  type SigningKeySettings,
} from "@ostiary/core/lib/signing-keys-policy";

/** Row key in `app_setting`. */
const SETTINGS_KEY = "signing_keys";

/**
 * Like the client registration settings, each instance reloads these at most once a minute,
 * so a change made in the admin console reaches the auth app within a minute.
 */
const REFRESH_MS = 60_000;

type SettingsCache = {
  loadedAt: number;
  inFlight: Promise<SigningKeySettings> | null;
  current: SigningKeySettings;
};
const cache = ((globalThis as { __ostiarySigningKeys?: SettingsCache }).__ostiarySigningKeys ??= {
  loadedAt: 0,
  inFlight: null,
  current: DEFAULT_SIGNING_KEY_SETTINGS,
});

export async function loadSigningKeySettings(): Promise<SigningKeySettings> {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, SETTINGS_KEY))
    .limit(1);
  return parseSigningKeySettings(row?.value);
}

/** Current settings, reloaded from the database when the cached copy is older than a minute. */
export async function currentSigningKeySettings(): Promise<SigningKeySettings> {
  if (Date.now() - cache.loadedAt < REFRESH_MS) return cache.current;
  cache.inFlight ??= loadSigningKeySettings()
    .then((settings) => {
      cache.current = settings;
      cache.loadedAt = Date.now();
      return settings;
    })
    .catch((error) => {
      // Keep the previous settings (rotation off until a first successful load); retry next request.
      console.error("Could not load the signing key settings", error);
      return cache.current;
    })
    .finally(() => {
      cache.inFlight = null;
    });
  return cache.inFlight;
}

export function invalidateSigningKeySettings() {
  cache.loadedAt = 0;
}

/**
 * Writes the current settings into the jwt plugin's options (once per request). Better Auth
 * reads `jwks.rotationInterval` when it creates a key and `jwks.gracePeriod` on every JWKS
 * request, both from this same options object.
 */
export async function syncSigningKeys(options: JwtOptions): Promise<SigningKeySettings> {
  const settings = await currentSigningKeySettings();
  applySigningKeySettings(options, settings);
  return settings;
}

/** Keys that still sign tokens: no expiry, or an expiry in the future. */
const live = (now: Date) => or(isNull(jwks.expiresAt), gt(jwks.expiresAt, now));

/**
 * Saves the settings and gives live keys the expiry the new interval implies (Better Auth only
 * sets it when it creates a key, so without this a key created while rotation was off would
 * never rotate). Turning rotation off clears the expiry of live keys.
 */
export async function saveSigningKeySettings(settings: SigningKeySettings, updatedBy: string | null): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(appSetting)
      .values({ key: SETTINGS_KEY, value: settings, updatedAt: now, updatedBy })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: settings, updatedAt: now, updatedBy } });
    const rows = await tx.select({ id: jwks.id, createdAt: jwks.createdAt }).from(jwks).where(live(now));
    for (const row of rows) {
      await tx.update(jwks).set({ expiresAt: liveKeyExpiry(row.createdAt, settings, now) }).where(eq(jwks.id, row.id));
    }
  });
  invalidateSigningKeySettings();
}

/** Every key, newest first, without the private key (never read it here). */
export async function listSigningKeys(): Promise<SigningKeyRow[]> {
  return db
    .select({ id: jwks.id, alg: jwks.alg, crv: jwks.crv, createdAt: jwks.createdAt, expiresAt: jwks.expiresAt })
    .from(jwks)
    .orderBy(desc(jwks.createdAt));
}

/** What `createJwk` needs from an endpoint context: the adapter and the secret. */
type AuthContextLike = { getPlugin: (id: string) => { options?: unknown } | null };

/**
 * Rotates now: creates a key (which signs every token from then on, as the newest live key),
 * then retires every other live key. Retired keys stay in the JWKS for the grace period, so
 * tokens they signed keep verifying; clients that cache the JWKS refetch it when they meet the
 * new key id. Returns the new key id and the ids retired.
 */
export async function rotateSigningKey(
  context: AuthContextLike,
  settings: SigningKeySettings,
): Promise<{ keyId: string; retired: string[] }> {
  const pluginOptions = (context.getPlugin("jwt")?.options ?? {}) as JwtOptions;
  const options: JwtOptions = { ...pluginOptions, jwks: { ...pluginOptions.jwks } };
  applySigningKeySettings(options, settings);
  // createJwk reads only ctx.context (adapter, secret). Outside a request the adapter is the base one.
  const key = await createJwk({ context } as unknown as Parameters<typeof createJwk>[0], options);
  const now = new Date();
  const retired = await db
    .update(jwks)
    .set({ expiresAt: now })
    .where(and(ne(jwks.id, key.id), live(now)))
    .returning({ id: jwks.id });
  return { keyId: key.id, retired: retired.map((row) => row.id) };
}
