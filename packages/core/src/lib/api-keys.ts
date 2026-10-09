import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@ostiary/core/db/index";
import { apikey, appSetting, oauthResource, organization, user } from "@ostiary/core/db/schema";
import {
  apiAcceptsKeys,
  DEFAULT_API_KEY_SETTINGS,
  keyOwnerType,
  MAX_KEYS_PER_ORGANIZATION,
  ORGANIZATION_KEY_CONFIG_ID,
  USER_KEY_CONFIG_ID,
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

/** Who owns a key: a user, or an organization (its keys outlive the member who created them). */
export type ApiKeyOwner =
  | { type: "user"; id: string; email: string; name: string }
  | { type: "organization"; id: string; name: string; slug: string };

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
  owner: ApiKeyOwner;
  /** Who created an organization's key; null for user keys and once that account is deleted. */
  createdBy: { id: string; email: string; name: string } | null;
};

const creator = alias(user, "creator");

const listColumns = {
  id: apikey.id,
  name: apikey.name,
  start: apikey.start,
  configId: apikey.configId,
  referenceId: apikey.referenceId,
  permissions: apikey.permissions,
  createdAt: apikey.createdAt,
  lastRequest: apikey.lastRequest,
  expiresAt: apikey.expiresAt,
  ownerEmail: user.email,
  ownerName: user.name,
  orgName: organization.name,
  orgSlug: organization.slug,
  creatorId: creator.id,
  creatorEmail: creator.email,
  creatorName: creator.name,
};

async function listKeys(where: SQL | undefined, limit: number): Promise<ApiKeyListItem[]> {
  const [rows, apis] = await Promise.all([
    db
      .select(listColumns)
      .from(apikey)
      .leftJoin(user, eq(user.id, apikey.userId))
      .leftJoin(organization, eq(organization.id, apikey.organizationId))
      .leftJoin(creator, eq(creator.id, apikey.createdBy))
      .where(where)
      .orderBy(desc(apikey.createdAt))
      .limit(limit),
    db.select({ identifier: oauthResource.identifier, name: oauthResource.name }).from(oauthResource),
  ]);
  const apiNames = new Map(apis.map((api) => [api.identifier, api.name]));
  return rows.map((row) => {
    const grant = parseKeyGrant(row.permissions);
    const owner: ApiKeyOwner =
      keyOwnerType(row.configId) === "organization"
        ? { type: "organization", id: row.referenceId, name: row.orgName ?? "", slug: row.orgSlug ?? "" }
        : { type: "user", id: row.referenceId, email: row.ownerEmail ?? "", name: row.ownerName ?? "" };
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
      owner,
      createdBy:
        row.creatorId && owner.type === "organization"
          ? { id: row.creatorId, email: row.creatorEmail ?? "", name: row.creatorName ?? "" }
          : null,
    };
  });
}

const userKeys = (userId: string) =>
  and(eq(apikey.configId, USER_KEY_CONFIG_ID), eq(apikey.referenceId, userId));
const organizationKeys = (organizationId: string) =>
  and(eq(apikey.configId, ORGANIZATION_KEY_CONFIG_ID), eq(apikey.referenceId, organizationId));

/** A user's own keys, newest first (not those of their organizations). */
export function listUserApiKeys(userId: string): Promise<ApiKeyListItem[]> {
  return listKeys(userKeys(userId), 100);
}

/** An organization's keys, newest first. */
export function listOrganizationApiKeys(organizationId: string): Promise<ApiKeyListItem[]> {
  return listKeys(organizationKeys(organizationId), MAX_KEYS_PER_ORGANIZATION);
}

/** Every key, user and organization keys alike, newest first (admin console). */
export function listAllApiKeys(limit = 500): Promise<ApiKeyListItem[]> {
  return listKeys(undefined, limit);
}

export async function countUserApiKeys(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(apikey).where(userKeys(userId));
  return row?.n ?? 0;
}

export async function countOrganizationApiKeys(organizationId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(apikey).where(organizationKeys(organizationId));
  return row?.n ?? 0;
}

/** Records who created an organization's key (the plugin does not take extra fields). */
export async function setApiKeyCreator(id: string, userId: string): Promise<void> {
  await db.update(apikey).set({ createdBy: userId }).where(eq(apikey.id, id));
}

/**
 * Deletes one key. With `userId`, only if it is that user's own key; with `organizationId`,
 * only if that organization owns it. Returns what was deleted, for the audit log, or null when
 * there was no such key.
 */
export async function deleteApiKey(
  id: string,
  owner?: string | { userId: string } | { organizationId: string },
): Promise<ApiKeyListItem | null> {
  const scope = typeof owner === "string" ? { userId: owner } : owner;
  const where = !scope
    ? eq(apikey.id, id)
    : "userId" in scope
      ? and(eq(apikey.id, id), userKeys(scope.userId))
      : and(eq(apikey.id, id), organizationKeys(scope.organizationId));
  const [found] = await listKeys(where, 1);
  if (!found) return null;
  const deleted = await db.delete(apikey).where(eq(apikey.id, found.id)).returning({ id: apikey.id });
  return deleted.length ? found : null;
}

/** Deletes every key of a user (ban). Returns how many there were. */
export async function deleteUserApiKeys(userId: string): Promise<number> {
  const deleted = await db.delete(apikey).where(userKeys(userId)).returning({ id: apikey.id });
  return deleted.length;
}

/** The audit log target for a key: its owner, the user or the organization. */
export function apiKeyAuditTarget(owner: ApiKeyOwner) {
  return owner.type === "organization"
    ? { type: "organization", id: owner.id, label: owner.name }
    : { type: "user", id: owner.id, label: owner.email };
}

/** What the audit log records about a key: never the key or its digest. */
export function apiKeyAuditMetadata(
  key: Pick<ApiKeyListItem, "id" | "name" | "start" | "api" | "scopes" | "expiresAt"> & { owner?: ApiKeyOwner },
) {
  return {
    keyId: key.id,
    ...(key.owner?.type === "organization" ? { ownerType: "organization", organizationId: key.owner.id } : {}),
    name: key.name,
    start: key.start,
    api: key.api,
    scopes: key.scopes,
    expiresAt: key.expiresAt?.toISOString() ?? null,
  };
}
