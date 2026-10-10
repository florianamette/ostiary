"use server";

import {
  grantPermissions,
  MAX_KEYS_PER_USER,
  validateNewKey,
  type NewKeyError,
} from "@ostiary/core/lib/api-key-policy";
import {
  apiKeyAuditMetadata,
  countUserApiKeys,
  currentApiKeySettings,
  deleteApiKey,
  findKeyApi,
  listUserApiKeys,
} from "@ostiary/core/lib/api-keys";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { env } from "@ostiary/core/lib/env";
import { auth } from "@/lib/auth";
import {
  apiKeysOverview,
  createdApiKeyItem,
  type CreatedApiKey,
} from "@/lib/api-key-actions-shared";
import { serializeApiKey, type MyApiKey } from "@/lib/api-key-serialize";
import { currentSession, signedInRecently } from "@/lib/server-session";

/*
 * The account dashboard's API keys. The plugin's own HTTP endpoints are closed (see the auth
 * factory): these actions are the only way to create, list and revoke keys from the browser,
 * so every key gets one registered API, some of its scopes and a bounded lifetime, and every
 * change is in the audit log.
 */

export type MyApiKeys = {
  enabled: boolean;
  maxLifetimeDays: number;
  lifetimeChoices: number[];
  nameMaxLength: number;
  maxKeys: number;
  apis: { identifier: string; name: string; scopes: string[] }[];
  keys: MyApiKey[];
};

export type CreateApiKeyError = NewKeyError | "signedOut" | "impersonating" | "recentSignIn" | "forbidden" | "failed";

/** The signed-in user's keys and what they may create; null when signed out. */
export async function getMyApiKeys(): Promise<MyApiKeys | null> {
  const { session } = await currentSession();
  if (!session) return null;
  return apiKeysOverview(listUserApiKeys(session.user.id), MAX_KEYS_PER_USER);
}

/**
 * Creates a key. Like adding a passkey, it grants lasting access, so it needs a sign-in from
 * the last 10 minutes, and an admin impersonating the user cannot create one. The key itself
 * is returned once and never stored.
 */
export async function createMyApiKey(input: {
  name: string;
  api: string;
  scopes: string[];
  expiresInDays: number;
}): Promise<{ ok: true; key: string; created: MyApiKey } | { ok: false; error: CreateApiKeyError }> {
  const { session, requestHeaders } = await currentSession();
  if (!session) return { ok: false, error: "signedOut" };
  if (session.session.impersonatedBy) return { ok: false, error: "impersonating" };
  if (!signedInRecently(session.session.createdAt)) return { ok: false, error: "recentSignIn" };
  const userId = session.user.id;
  const [settings, api, keysHeld] = await Promise.all([
    currentApiKeySettings(),
    typeof input.api === "string" ? findKeyApi(input.api) : null,
    countUserApiKeys(userId),
  ]);
  const checked = validateNewKey(input, { settings, api, authServer: env.AUTH_APP_URL, keysHeld });
  if (!checked.ok) return checked;
  const { name, grant, expiresInSeconds } = checked.value;

  let created: CreatedApiKey;
  try {
    // A server call (no headers): the plugin lets the server set `permissions` and the owner.
    created = await auth.api.createApiKey({
      body: { userId, name, expiresIn: expiresInSeconds, permissions: grantPermissions(grant) },
    });
  } catch (error) {
    console.error("Could not create an API key", error);
    return { ok: false, error: "failed" };
  }
  const item = createdApiKeyItem(created, {
    name,
    api: grant.api,
    apiName: api?.name ?? null,
    scopes: grant.scopes,
    owner: { type: "user", id: userId, email: session.user.email, name: session.user.name },
    createdBy: null,
  });
  await recordAudit({
    actor: { id: userId, email: session.user.email },
    action: "api_key.create",
    target: { type: "user", id: userId, label: session.user.email },
    metadata: apiKeyAuditMetadata(item),
    ipAddress: clientIp(requestHeaders),
  });
  return { ok: true, key: created.key, created: serializeApiKey(item) };
}

/** Revokes (deletes) one of the signed-in user's keys. */
export async function revokeMyApiKey(id: string): Promise<{ ok: boolean }> {
  const { session, requestHeaders } = await currentSession();
  if (!session || typeof id !== "string" || !id) return { ok: false };
  const deleted = await deleteApiKey(id, session.user.id);
  if (!deleted) return { ok: false };
  await recordAudit({
    actor: { id: session.user.id, email: session.user.email },
    action: "api_key.revoke",
    target: { type: "user", id: session.user.id, label: session.user.email },
    metadata: apiKeyAuditMetadata(deleted),
    ipAddress: clientIp(requestHeaders),
  });
  return { ok: true };
}
