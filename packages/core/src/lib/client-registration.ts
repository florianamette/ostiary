import { and, desc, eq, gt, isNotNull, not, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { appSetting, oauthClient } from "@ostiary/core/db/schema";
import {
  applyClientRegistration,
  DEFAULT_CLIENT_REGISTRATION_SETTINGS,
  parseClientRegistrationSettings,
  PLATFORM_CLIENT_REFERENCE,
  registrationSource,
  type ClientRegistrationSettings,
  type RegistrationProviderOptions,
  type RegistrationSource,
} from "@ostiary/core/lib/client-registration-policy";

/** Row key in `app_setting`. */
const SETTINGS_KEY = "client_registration";

/**
 * Like the API scopes (see oauth-scopes.ts), each instance reloads the settings at most once
 * a minute, so a change made in the admin console reaches the auth app within a minute.
 */
const REFRESH_MS = 60_000;

type SettingsCache = {
  loadedAt: number;
  inFlight: Promise<ClientRegistrationSettings> | null;
  current: ClientRegistrationSettings;
};
const cache = ((globalThis as { __ostiaryClientRegistration?: SettingsCache }).__ostiaryClientRegistration ??= {
  loadedAt: 0,
  inFlight: null,
  current: DEFAULT_CLIENT_REGISTRATION_SETTINGS,
});

export async function loadClientRegistrationSettings(): Promise<ClientRegistrationSettings> {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, SETTINGS_KEY))
    .limit(1);
  return parseClientRegistrationSettings(row?.value);
}

/** Current settings, reloaded from the database when the cached copy is older than a minute. */
export async function currentClientRegistrationSettings(): Promise<ClientRegistrationSettings> {
  if (Date.now() - cache.loadedAt < REFRESH_MS) return cache.current;
  cache.inFlight ??= loadClientRegistrationSettings()
    .then((settings) => {
      cache.current = settings;
      cache.loadedAt = Date.now();
      return settings;
    })
    .catch((error) => {
      // Keep the previous settings (off until a first successful load); retry next request.
      console.error("Could not load the client registration settings", error);
      return cache.current;
    })
    .finally(() => {
      cache.inFlight = null;
    });
  return cache.inFlight;
}

export function invalidateClientRegistrationSettings() {
  cache.loadedAt = 0;
}

export async function saveClientRegistrationSettings(
  settings: ClientRegistrationSettings,
  updatedBy: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(appSetting)
    .values({ key: SETTINGS_KEY, value: settings, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: settings, updatedAt: now, updatedBy } });
  invalidateClientRegistrationSettings();
}

/** Writes the current settings into the oauth-provider plugin's options (once per request). */
export async function syncClientRegistration(
  options: RegistrationProviderOptions,
  metadataDocuments: unknown,
): Promise<ClientRegistrationSettings> {
  const settings = await currentClientRegistrationSettings();
  applyClientRegistration(options, settings, metadataDocuments);
  return settings;
}

/**
 * SQL condition matching every client that is not admin-registered: dynamic registration,
 * metadata documents, and anything else without the admin marker (see registrationSource).
 */
const selfRegistered = not(oauthClient.adminRegistered);

/** Self-registered clients created in the last hour, on every instance. */
export async function countRecentSelfRegistrations(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(oauthClient)
    .where(and(gt(oauthClient.createdAt, since), selfRegistered));
  return row?.count ?? 0;
}

/** Whether another client may register now, under the hourly limit. */
export async function registrationCapacityLeft(settings: ClientRegistrationSettings): Promise<boolean> {
  return (await countRecentSelfRegistrations()) < settings.maxRegistrationsPerHour;
}

export async function clientExists(clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: oauthClient.id })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return Boolean(row);
}

/** How a client was registered, or null when it does not exist. */
export async function clientRegistrationSource(clientId: string): Promise<RegistrationSource | null> {
  const [row] = await db
    .select({
      clientDiscoveryId: oauthClient.clientDiscoveryId,
      metadata: oauthClient.metadata,
      adminRegistered: oauthClient.adminRegistered,
    })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return row ? registrationSource(row) : null;
}

/**
 * Marks a client the admin console just created as admin-registered. Only a client owned by
 * the platform (Better Auth gave it PLATFORM_CLIENT_REFERENCE, which only admins map to)
 * can be marked. Returns false when no such client exists.
 */
export async function markAdminRegisteredClient(clientId: string): Promise<boolean> {
  const updated = await db
    .update(oauthClient)
    .set({ adminRegistered: true })
    .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.referenceId, PLATFORM_CLIENT_REFERENCE)))
    .returning({ id: oauthClient.id });
  return updated.length > 0;
}

/**
 * Removes scopes that are no longer allowed from self-registered clients, so narrowing the
 * settings also narrows clients registered before. (Metadata-document clients get the
 * current list again whenever their document is fetched.)
 */
export async function restrictSelfRegisteredScopes(allowed: readonly string[]): Promise<number> {
  const updated = await db
    .update(oauthClient)
    .set({
      scopes: sql`array(select unnest(${oauthClient.scopes}) intersect select unnest(${sql.param([...allowed])}::text[]))`,
      updatedAt: new Date(),
    })
    .where(and(selfRegistered, isNotNull(oauthClient.scopes), sql`not (${oauthClient.scopes} <@ ${sql.param([...allowed])}::text[])`))
    .returning({ id: oauthClient.id });
  return updated.length;
}

export type SelfRegisteredClient = {
  clientId: string;
  name: string | null;
  source: RegistrationSource;
  disabled: boolean;
  skipConsent: boolean;
  tokenEndpointAuthMethod: string | null;
  grantTypes: string[];
  redirectUris: string[];
  scopes: string[];
  ownerId: string | null;
  createdAt: Date | null;
};

/**
 * Every client that is not admin-registered, newest first. Better Auth's list only returns
 * the platform's clients, so these are loaded here for the admin console.
 */
export async function listSelfRegisteredClients(limit = 500): Promise<SelfRegisteredClient[]> {
  const rows = await db
    .select()
    .from(oauthClient)
    .where(selfRegistered)
    .orderBy(desc(oauthClient.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.name,
    source: registrationSource(row),
    disabled: Boolean(row.disabled),
    skipConsent: Boolean(row.skipConsent),
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    grantTypes: row.grantTypes ?? [],
    redirectUris: row.redirectUris,
    scopes: row.scopes ?? [],
    ownerId: row.userId,
    createdAt: row.createdAt,
  }));
}
