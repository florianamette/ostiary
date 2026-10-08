import { and, count, desc, eq, type SQL } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { apikey, appSetting, oauthResource, user } from "@ostiary/core/db/schema";
import {
  apiAcceptsKeys,
  DEFAULT_API_KEY_SETTINGS,
  parseApiKeySettings,
  parseKeyGrant,
  toKeyApi,
  type ApiKeySettings,
  type KeyApi,
} from "@ostiary/core/lib/api-key-policy";

/** Row key in `app_setting`. */
const SETTINGS_KEY = "api_keys";

/**
 * Like the client registration settings, each instance reloads these at most once a minute,
 * so a change made in the admin console reaches the auth app within a minute.
 */
const REFRESH_MS = 60_000;

type SettingsCache = { loadedAt: number; inFlight: Promise<ApiKeySettings> | null; current: ApiKeySettings };
const cache = ((globalThis as { __ostiaryApiKeySettings?: SettingsCache }).__ostiaryApiKeySettings ??= {
  loadedAt: 0,
  inFlight: null,
  current: DEFAULT_API_KEY_SETTINGS,
});

export async function loadApiKeySettings(): Promise<ApiKeySettings> {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, SETTINGS_KEY))
    .limit(1);
  return parseApiKeySettings(row?.value);
}

/** Current settings, reloaded from the database when the cached copy is older than a minute. */
export async function currentApiKeySettings(): Promise<ApiKeySettings> {
  if (Date.now() - cache.loadedAt < REFRESH_MS) return cache.current;
  cache.inFlight ??= loadApiKeySettings()
    .then((settings) => {
      cache.current = settings;
      cache.loadedAt = Date.now();
      return settings;
    })
    .catch((error) => {
      // Keep the previous settings (off until a first successful load); retry next request.
      console.error("Could not load the API key settings", error);
      return cache.current;
    })
    .finally(() => {
      cache.inFlight = null;
    });
  return cache.inFlight;
}

export async function saveApiKeySettings(settings: ApiKeySettings, updatedBy: string | null): Promise<void> {
  const now = new Date();
  await db
    .insert(appSetting)
    .values({ key: SETTINGS_KEY, value: settings, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: settings, updatedAt: now, updatedBy } });
  cache.loadedAt = 0;
}

/** One API, or null when it is not registered. */
export async function findKeyApi(identifier: string): Promise<KeyApi | null> {
  const [row] = await db.select().from(oauthResource).where(eq(oauthResource.identifier, identifier)).limit(1);
  return row ? toKeyApi(row) : null;
}

/** The APIs keys can be created for, by name. */
export async function apisAcceptingKeys(authServer: string | undefined): Promise<KeyApi[]> {
  const rows = await db.select().from(oauthResource);
  return rows
    .map(toKeyApi)
    .filter((api) => apiAcceptsKeys(api, authServer))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A key as listed in the dashboard and the admin console. Never the key itself. */
export type ApiKeyListItem = {
  id: string;
  name: string;
  /** First characters of the key, prefix included. */
  start: string | null;
  api: string | null;
  apiName: string | null;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  owner: { id: string; email: string; name: string };
};

const listColumns = {
  id: apikey.id,
  name: apikey.name,
  start: apikey.start,
  permissions: apikey.permissions,
  createdAt: apikey.createdAt,
  lastRequest: apikey.lastRequest,
  expiresAt: apikey.expiresAt,
  ownerId: user.id,
  ownerEmail: user.email,
  ownerName: user.name,
};

async function listKeys(where: SQL | undefined, limit: number): Promise<ApiKeyListItem[]> {
  const [rows, apis] = await Promise.all([
    db
      .select(listColumns)
      .from(apikey)
      .innerJoin(user, eq(user.id, apikey.referenceId))
      .where(where)
      .orderBy(desc(apikey.createdAt))
      .limit(limit),
    db.select({ identifier: oauthResource.identifier, name: oauthResource.name }).from(oauthResource),
  ]);
  const apiNames = new Map(apis.map((api) => [api.identifier, api.name]));
  return rows.map((row) => {
    const grant = parseKeyGrant(row.permissions);
    return {
      id: row.id,
      name: row.name ?? "",
      start: row.start,
      api: grant?.api ?? null,
      apiName: grant ? (apiNames.get(grant.api) ?? null) : null,
      scopes: grant?.scopes ?? [],
      createdAt: row.createdAt,
      lastUsedAt: row.lastRequest,
      expiresAt: row.expiresAt,
      owner: { id: row.ownerId, email: row.ownerEmail, name: row.ownerName },
    };
  });
}

/** A user's keys, newest first. */
export function listUserApiKeys(userId: string): Promise<ApiKeyListItem[]> {
  return listKeys(eq(apikey.referenceId, userId), 100);
}

/** Every key, newest first (admin console). */
export function listAllApiKeys(limit = 500): Promise<ApiKeyListItem[]> {
  return listKeys(undefined, limit);
}

export async function countUserApiKeys(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(apikey).where(eq(apikey.referenceId, userId));
  return row?.n ?? 0;
}

/**
 * Deletes one key. With `userId`, only if that user owns it. Returns what was deleted, for the
 * audit log, or null when there was no such key.
 */
export async function deleteApiKey(id: string, userId?: string): Promise<ApiKeyListItem | null> {
  const [found] = await listKeys(
    userId ? and(eq(apikey.id, id), eq(apikey.referenceId, userId)) : eq(apikey.id, id),
    1,
  );
  if (!found) return null;
  const deleted = await db.delete(apikey).where(eq(apikey.id, found.id)).returning({ id: apikey.id });
  return deleted.length ? found : null;
}

/** Deletes every key of a user (ban). Returns how many there were. */
export async function deleteUserApiKeys(userId: string): Promise<number> {
  const deleted = await db.delete(apikey).where(eq(apikey.referenceId, userId)).returning({ id: apikey.id });
  return deleted.length;
}

/** What the audit log records about a key: never the key or its digest. */
export function apiKeyAuditMetadata(key: Pick<ApiKeyListItem, "id" | "name" | "start" | "api" | "scopes" | "expiresAt">) {
  return {
    keyId: key.id,
    name: key.name,
    start: key.start,
    api: key.api,
    scopes: key.scopes,
    expiresAt: key.expiresAt?.toISOString() ?? null,
  };
}
