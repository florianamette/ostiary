"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@ostiary/core/db/index";
import { member, organization } from "@ostiary/core/db/schema";
import {
  API_KEY_NAME_MAX_LENGTH,
  canManageOrganizationKeys,
  grantPermissions,
  lifetimeChoices,
  MAX_KEYS_PER_ORGANIZATION,
  ORGANIZATION_KEY_CONFIG_ID,
  organizationMayOwnKeys,
  validateNewKey,
} from "@ostiary/core/lib/api-key-policy";
import {
  apiKeyAuditMetadata,
  apiKeyAuditTarget,
  apisAcceptingKeys,
  countOrganizationApiKeys,
  currentApiKeySettings,
  deleteApiKey,
  findKeyApi,
  listOrganizationApiKeys,
  setApiKeyCreator,
  type ApiKeyListItem,
} from "@ostiary/core/lib/api-keys";
import { recordAudit } from "@ostiary/core/lib/audit";
import { RECENT_SIGN_IN_SECONDS } from "@ostiary/core/lib/auth-factory";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { env } from "@ostiary/core/lib/env";
import { auth } from "@/lib/auth";
import { serializeApiKey, type MyApiKey } from "@/lib/api-key-serialize";
import type { CreateApiKeyError, MyApiKeys } from "@/lib/api-keys-actions";

/*
 * Organization API keys, from the dashboard's Organizations section. The organization owns
 * the key: it keeps working when the member who created it leaves, and goes with the
 * organization. Only owners and admins of the organization can list, create and revoke its
 * keys; members do not see them (key names, APIs and creators are the admins' business). The
 * plugin re-checks the role on creation (organization access control, see the auth factory).
 */

async function currentSession() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { session, requestHeaders };
}

/** The organization, if the user is an owner or admin of it and it may own keys. */
async function managedOrganization(userId: string, organizationId: unknown) {
  if (typeof organizationId !== "string" || !organizationMayOwnKeys(organizationId)) return null;
  const [row] = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  return row && canManageOrganizationKeys(row.role) ? { id: row.id, name: row.name } : null;
}

/** Ids of the organizations whose keys the signed-in user manages (owner or admin). */
export async function getOrganizationsWithManagedApiKeys(): Promise<string[]> {
  const { session } = await currentSession();
  if (!session) return [];
  const rows = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, session.user.id));
  return rows
    .filter((row) => organizationMayOwnKeys(row.organizationId) && canManageOrganizationKeys(row.role))
    .map((row) => row.organizationId);
}

/** An organization's keys and what may be created; null unless the user is an owner or admin. */
export async function getOrganizationApiKeys(organizationId: string): Promise<MyApiKeys | null> {
  const { session } = await currentSession();
  if (!session) return null;
  const org = await managedOrganization(session.user.id, organizationId);
  if (!org) return null;
  const [settings, apis, keys] = await Promise.all([
    currentApiKeySettings(),
    apisAcceptingKeys(env.AUTH_APP_URL),
    listOrganizationApiKeys(org.id),
  ]);
  return {
    enabled: settings.enabled,
    maxLifetimeDays: settings.maxLifetimeDays,
    lifetimeChoices: lifetimeChoices(settings.maxLifetimeDays),
    nameMaxLength: API_KEY_NAME_MAX_LENGTH,
    maxKeys: MAX_KEYS_PER_ORGANIZATION,
    apis: settings.enabled ? apis.map(({ identifier, name, scopes }) => ({ identifier, name, scopes })) : [],
    keys: keys.map(serializeApiKey),
  };
}

/**
 * Creates a key owned by the organization. Same rules as a personal key (recent sign-in, no
 * impersonation, one API and its scopes, bounded lifetime, shown once), with a per-organization
 * cap. The creator is recorded on the key and in the audit log.
 */
export async function createOrganizationApiKey(
  organizationId: string,
  input: { name: string; api: string; scopes: string[]; expiresInDays: number },
): Promise<{ ok: true; key: string; created: MyApiKey } | { ok: false; error: CreateApiKeyError }> {
  const { session, requestHeaders } = await currentSession();
  if (!session) return { ok: false, error: "signedOut" };
  if (session.session.impersonatedBy) return { ok: false, error: "impersonating" };
  const org = await managedOrganization(session.user.id, organizationId);
  if (!org) return { ok: false, error: "forbidden" };
  if (Date.now() - new Date(session.session.createdAt).getTime() > RECENT_SIGN_IN_SECONDS * 1000) {
    return { ok: false, error: "recentSignIn" };
  }
  const userId = session.user.id;
  const [settings, api, keysHeld] = await Promise.all([
    currentApiKeySettings(),
    typeof input.api === "string" ? findKeyApi(input.api) : null,
    countOrganizationApiKeys(org.id),
  ]);
  const checked = validateNewKey(input, {
    settings,
    api,
    authServer: env.AUTH_APP_URL,
    keysHeld,
    maxKeys: MAX_KEYS_PER_ORGANIZATION,
  });
  if (!checked.ok) return checked;
  const { name, grant, expiresInSeconds } = checked.value;

  let created: { id: string; key: string; start: string | null; createdAt: Date; expiresAt: Date | null };
  try {
    // A server call: the plugin sets `permissions`, makes the organization the owner and checks
    // that `userId` may create its keys (organization role).
    created = await auth.api.createApiKey({
      body: {
        configId: ORGANIZATION_KEY_CONFIG_ID,
        organizationId: org.id,
        userId,
        name,
        expiresIn: expiresInSeconds,
        permissions: grantPermissions(grant),
      },
    });
    await setApiKeyCreator(created.id, userId);
  } catch (error) {
    console.error("Could not create an organization API key", error);
    return { ok: false, error: "failed" };
  }
  const item: ApiKeyListItem = {
    id: created.id,
    name,
    start: created.start,
    api: grant.api,
    apiName: api?.name ?? null,
    scopes: grant.scopes,
    createdAt: new Date(created.createdAt),
    lastUsedAt: null,
    expiresAt: created.expiresAt ? new Date(created.expiresAt) : null,
    owner: { type: "organization", id: org.id, name: org.name, slug: "" },
    createdBy: { id: userId, email: session.user.email, name: session.user.name },
  };
  await recordAudit({
    actor: { id: userId, email: session.user.email },
    action: "api_key.create",
    target: apiKeyAuditTarget(item.owner),
    metadata: apiKeyAuditMetadata(item),
    ipAddress: clientIp(requestHeaders),
  });
  return { ok: true, key: created.key, created: serializeApiKey(item) };
}

/** Revokes (deletes) one of the organization's keys. Owners and admins only. */
export async function revokeOrganizationApiKey(organizationId: string, id: string): Promise<{ ok: boolean }> {
  const { session, requestHeaders } = await currentSession();
  if (!session || typeof id !== "string" || !id) return { ok: false };
  const org = await managedOrganization(session.user.id, organizationId);
  if (!org) return { ok: false };
  const deleted = await deleteApiKey(id, { organizationId: org.id });
  if (!deleted) return { ok: false };
  await recordAudit({
    actor: { id: session.user.id, email: session.user.email },
    action: "api_key.revoke",
    target: apiKeyAuditTarget(deleted.owner),
    metadata: apiKeyAuditMetadata(deleted),
    ipAddress: clientIp(requestHeaders),
  });
  return { ok: true };
}
