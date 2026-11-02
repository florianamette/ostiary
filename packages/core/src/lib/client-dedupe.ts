import { and, eq, gt, inArray, isNull, max, not, notExists, or, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@ostiary/core/db/schema";
import {
  compareClientsToKeep,
  neverUsedFor,
  planDuplicateCleanup,
  publicClientDedupeKey,
  registrationRequestDedupeFields,
  type ClientActivity,
} from "@ostiary/core/lib/client-dedupe-policy";
import { registrationSource } from "@ostiary/core/lib/client-registration-policy";

/*
 * Identical self-registered public clients, against the database: the existing client an
 * anonymous registration gets back, and the cleanup of duplicates registered before.
 * The rules are in client-dedupe-policy.ts.
 */

type ClientRow = typeof oauthClient.$inferSelect;

/** Not admin-registered (see registrationSource), and not from a metadata document. */
const dynamicallyRegistered = and(not(oauthClient.adminRegistered), isNull(oauthClient.clientDiscoveryId));

/** `disabled` defaults to false but is nullable: a null is an enabled client. */
const enabled = or(isNull(oauthClient.disabled), eq(oauthClient.disabled, false));

/** Latest use and live tokens of each client (clients never used are missing from the map). */
async function clientActivity(clientIds: string[]): Promise<Map<string, { last: Date | null; live: number }>> {
  const activity = new Map<string, { last: Date | null; live: number }>();
  if (clientIds.length === 0) return activity;
  const now = new Date();
  const add = (clientId: string, last: Date | null, live: number) => {
    const current = activity.get(clientId) ?? { last: null, live: 0 };
    if (last && (!current.last || last > current.last)) current.last = last;
    current.live += live;
    activity.set(clientId, current);
  };
  for (const table of [oauthAccessToken, oauthRefreshToken]) {
    const rows = await db
      .select({
        clientId: table.clientId,
        last: max(table.createdAt),
        // Neither revoked nor expired: a signed-in session still relies on the client.
        live: sql<number>`(count(*) filter (where ${and(isNull(table.revoked), gt(table.expiresAt, now))}))::int`,
      })
      .from(table)
      .where(inArray(table.clientId, clientIds))
      .groupBy(table.clientId);
    for (const row of rows) add(row.clientId, row.last, row.live);
  }
  const consents = await db
    .select({ clientId: oauthConsent.clientId, last: max(oauthConsent.updatedAt) })
    .from(oauthConsent)
    .where(inArray(oauthConsent.clientId, clientIds))
    .groupBy(oauthConsent.clientId);
  for (const row of consents) add(row.clientId, row.last, 0);
  return activity;
}

async function withActivity(rows: ClientRow[]): Promise<(ClientActivity & { row: ClientRow })[]> {
  const activity = await clientActivity(rows.map((row) => row.clientId));
  return rows.map((row) => ({
    row,
    clientId: row.clientId,
    createdAt: row.createdAt,
    lastActivityAt: activity.get(row.clientId)?.last ?? null,
    liveTokens: activity.get(row.clientId)?.live ?? 0,
  }));
}

/**
 * The RFC 7591 registration response for a stored public client, as Better Auth answers a
 * new registration (its `schemaToOAuth`), without a secret since a public client has none.
 */
export function registrationResponse(row: ClientRow): Record<string, unknown> {
  const response: Record<string, unknown> = {
    client_id: row.clientId,
    client_id_issued_at: row.createdAt ? Math.round(row.createdAt.getTime() / 1000) : undefined,
    client_name: row.name,
    client_uri: row.uri,
    logo_uri: row.icon,
    contacts: row.contacts,
    tos_uri: row.tos,
    policy_uri: row.policy,
    software_id: row.softwareId,
    software_version: row.softwareVersion,
    redirect_uris: row.redirectUris ?? [],
    post_logout_redirect_uris: row.postLogoutRedirectUris,
    token_endpoint_auth_method: row.tokenEndpointAuthMethod,
    grant_types: row.grantTypes,
    response_types: row.responseTypes,
    application_type: row.applicationType,
    scope: row.scopes?.join(" "),
    disabled: row.disabled,
    skip_consent: row.skipConsent,
    enable_end_session: row.enableEndSession,
    require_pkce: row.requirePKCE,
    dpop_bound_access_tokens: row.dpopBoundAccessTokens,
    subject_type: row.subjectType,
  };
  return Object.fromEntries(Object.entries(response).filter(([, value]) => value !== null && value !== undefined));
}

/**
 * The existing client an anonymous /oauth2/register request may get back: a dynamically
 * registered, enabled, public client without an owner and with the same dedupe key. Of
 * several, the most recently used. Null when the request must create a client.
 *
 * @param scopes What a new self-registered client is stored with (the allowed scopes).
 */
export async function findReusablePublicClient(body: unknown, scopes: readonly string[]): Promise<ClientRow | null> {
  const fields = registrationRequestDedupeFields(body, scopes);
  const key = fields && publicClientDedupeKey(fields);
  if (!fields || !key) return null;
  const candidates = await db
    .select()
    .from(oauthClient)
    .where(
      and(
        dynamicallyRegistered,
        eq(oauthClient.tokenEndpointAuthMethod, "none"),
        isNull(oauthClient.clientSecret),
        isNull(oauthClient.userId),
        isNull(oauthClient.referenceId),
        enabled,
        fields.name === null ? isNull(oauthClient.name) : eq(oauthClient.name, fields.name),
      ),
    );
  const matching = candidates.filter((row) => registrationSource(row) === "dynamic" && publicClientDedupeKey(row) === key);
  if (matching.length === 0) return null;
  const [best] = (await withActivity(matching)).sort(compareClientsToKeep);
  return best!.row;
}

/** Deletes the clients without a live token, checked again in the same statement. */
async function deleteUnusedClients(clientIds: string[]): Promise<string[]> {
  if (clientIds.length === 0) return [];
  const now = new Date();
  const liveTokens = (table: typeof oauthAccessToken | typeof oauthRefreshToken) =>
    db
      .select({ one: sql`1` })
      .from(table)
      .where(and(eq(table.clientId, oauthClient.clientId), isNull(table.revoked), gt(table.expiresAt, now)));
  // Consents and expired tokens go with them (foreign keys cascade).
  const deleted = await db
    .delete(oauthClient)
    .where(
      and(
        inArray(oauthClient.clientId, clientIds),
        not(oauthClient.adminRegistered),
        notExists(liveTokens(oauthAccessToken)),
        notExists(liveTokens(oauthRefreshToken)),
      ),
    )
    .returning({ clientId: oauthClient.clientId });
  return deleted.map((row) => row.clientId);
}

export type DuplicateCleanupReport = {
  groups: {
    name: string | null;
    kept: string;
    removed: string[];
    /** Left in place: they still hold live tokens. */
    inUse: string[];
  }[];
  removed: number;
  inUse: number;
};

/**
 * Removes duplicate self-registered public clients: in each group sharing a dedupe key, keeps
 * the most recently used one, and deletes the others unless they still hold a live access or
 * refresh token (those are reported in `inUse`), so no signed-in session breaks. Disabled
 * clients are left alone, neither kept nor deleted: an admin disabled them on purpose, and only
 * an enabled client is handed back to a registration.
 */
export async function removeDuplicateSelfRegisteredClients(): Promise<DuplicateCleanupReport> {
  const rows = (await db.select().from(oauthClient).where(and(dynamicallyRegistered, enabled))).filter(
    (row) => registrationSource(row) === "dynamic",
  );
  const keyed = rows.flatMap((row) => {
    const key = publicClientDedupeKey(row);
    return key ? [{ row, key }] : [];
  });
  const activity = await withActivity(keyed.map(({ row }) => row));
  const plans = planDuplicateCleanup(activity.map((client, i) => ({ ...client, key: keyed[i]!.key })));
  const names = new Map(rows.map((row) => [row.clientId, row.name]));

  const deleted = new Set(await deleteUnusedClients(plans.flatMap((plan) => plan.remove)));
  const groups = plans.map((plan) => ({
    name: names.get(plan.keep) ?? null,
    kept: plan.keep,
    removed: plan.remove.filter((id) => deleted.has(id)),
    // A token issued between the plan and the delete keeps its client too.
    inUse: [...plan.inUse, ...plan.remove.filter((id) => !deleted.has(id))],
  }));
  return {
    groups,
    removed: groups.reduce((sum, group) => sum + group.removed.length, 0),
    inUse: groups.reduce((sum, group) => sum + group.inUse.length, 0),
  };
}

/**
 * Deletes self-registered clients (dynamic or metadata document) never used: no token and no
 * consent, registered more than `days` days ago. Returns the deleted client ids.
 */
export async function pruneNeverUsedSelfRegisteredClients(days: number): Promise<string[]> {
  const rows = await db.select().from(oauthClient).where(not(oauthClient.adminRegistered));
  const now = new Date();
  const unused = (await withActivity(rows)).filter((client) => neverUsedFor(client, days, now));
  return deleteUnusedClients(unused.map((client) => client.clientId));
}

/** Dedupe key of each self-registered client that has one, for grouping them in the console. */
export function selfRegisteredDedupeKey(row: ClientRow): string | null {
  return row.clientDiscoveryId === null && registrationSource(row) === "dynamic" ? publicClientDedupeKey(row) : null;
}
