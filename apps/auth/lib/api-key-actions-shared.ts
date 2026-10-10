import { API_KEY_NAME_MAX_LENGTH, lifetimeChoices } from "@ostiary/core/lib/api-key-policy";
import {
  apisAcceptingKeys,
  currentApiKeySettings,
  type ApiKeyListItem,
} from "@ostiary/core/lib/api-keys";
import { env } from "@ostiary/core/lib/env";
import { serializeApiKey } from "@/lib/api-key-serialize";
import type { MyApiKeys } from "@/lib/api-keys-actions";

/*
 * What the personal and organization API key actions share. Not a "use server" module: none
 * of this is callable from the browser on its own.
 */

/** What the plugin returns for a new key. */
export type CreatedApiKey = { id: string; key: string; start: string | null; createdAt: Date; expiresAt: Date | null };

/** A set of keys and what may be created next to them, as the dashboard shows it. */
export async function apiKeysOverview(
  listKeys: Promise<ApiKeyListItem[]>,
  maxKeys: number,
): Promise<MyApiKeys> {
  const [settings, apis, keys] = await Promise.all([
    currentApiKeySettings(),
    apisAcceptingKeys(env.AUTH_APP_URL),
    listKeys,
  ]);
  return {
    enabled: settings.enabled,
    maxLifetimeDays: settings.maxLifetimeDays,
    lifetimeChoices: lifetimeChoices(settings.maxLifetimeDays),
    nameMaxLength: API_KEY_NAME_MAX_LENGTH,
    maxKeys,
    apis: settings.enabled ? apis.map(({ identifier, name, scopes }) => ({ identifier, name, scopes })) : [],
    keys: keys.map(serializeApiKey),
  };
}

/** The list item of a key just created, for the audit log and the dashboard. */
export function createdApiKeyItem(
  created: CreatedApiKey,
  key: Pick<ApiKeyListItem, "name" | "api" | "apiName" | "scopes" | "owner" | "createdBy">,
): ApiKeyListItem {
  return {
    id: created.id,
    start: created.start,
    createdAt: new Date(created.createdAt),
    lastUsedAt: null,
    expiresAt: created.expiresAt ? new Date(created.expiresAt) : null,
    ...key,
  };
}
