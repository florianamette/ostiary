import { and, asc, eq, inArray, like } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@ostiary/core/db/index";
import { oauthClient, oauthClientResource, oauthResource } from "@ostiary/core/db/schema";
import { markAdminRegisteredClient } from "@ostiary/core/lib/client-registration";
import { PLATFORM_CLIENT_REFERENCE } from "@ostiary/core/lib/client-registration-policy";
import { withRequestedClientId } from "@ostiary/core/lib/admin/oauth-clients/requested-client-id";
import {
  parseStoredClientSecret,
  previousSecretExpiry,
  SECRET_GRACE_PERIODS,
  withPreviousSecret,
  type SecretGracePeriod,
} from "@ostiary/core/lib/client-secret-grace";
import {
  BACKCHANNEL_WITHOUT_USERS_MESSAGE,
  deviceCodeUpdateError,
  withDeviceCodeGrant,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
import { OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";
import { isMachineClient } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import { betterAuthErrorMessage, betterAuthErrorStatus } from "@ostiary/core/lib/api/better-auth-error";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@ostiary/core/lib/errors";
import type {
  CreateOAuthClientAdminInput,
  OAuthClientAdminPayload,
  UpdateOAuthClientAdminInput,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";

/**
 * Rethrows an error from a Better Auth call as one of lib/errors, so the route answers with
 * its status. A client error (4xx) keeps the message from Better Auth's body (OAuth endpoints
 * put it in `error_description`); anything else, a database error or a 5xx, is rethrown as is
 * and becomes a plain 500 without its internals.
 */
function throwFromBetterAuthCall(error: unknown): never {
  const status = betterAuthErrorStatus(error);
  if (status === undefined || status >= 500) throw error;
  const message = betterAuthErrorMessage(error, "Request failed");
  if (status === 404) throw new NotFoundError(message);
  if (status === 403) throw new ForbiddenError(message);
  if (status === 401) throw new UnauthorizedError(message);
  throw new BadRequestError(message);
}

/**
 * Better Auth 1.7 denies client_credentials tokens unless the client lists its machine scopes.
 * A client with that grant may use the scopes it is registered with, as in 1.5.
 */
function machineScopes(grantTypes: readonly string[] | undefined, scope: string | undefined) {
  if (!grantTypes?.includes("client_credentials") || !scope) return {};
  return { client_credentials_scopes: scope.split(/\s+/).filter(Boolean) };
}

/** Deletes a client that could not be fully set up, rather than leave it half registered. */
async function discardClient(clientId: unknown) {
  if (typeof clientId !== "string") return;
  await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId)).catch(() => {});
}

/**
 * Creates an OAuth client using Better Auth’s server-only admin API, then marks it
 * admin-registered (`oauth_client.admin_registered`) and links it to `input.resources` (the
 * APIs page's links). Better Auth gives it the platform's reference (see `clientReference`),
 * so every admin, and only admins, can manage it. A client without the authorization_code
 * grant (machine-to-machine) is sent without redirect URIs: Better Auth only requires them for
 * that grant. `input.client_id`, when set, becomes the client's ID (see requested-client-id.ts).
 * Caller must already enforce admin session (e.g. route guard).
 */
export async function createOAuthClientForAdmin(
  requestHeaders: Headers,
  input: CreateOAuthClientAdminInput,
): Promise<OAuthClientAdminPayload> {
  if (input.client_id) {
    const [taken] = await db
      .select({ clientId: oauthClient.clientId })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, input.client_id))
      .limit(1);
    if (taken) throw new BadRequestError("An app already has this client ID.");
  }
  let data: OAuthClientAdminPayload;
  try {
    data = (await withRequestedClientId(input.client_id, () => auth.api.adminCreateOAuthClient({
      headers: requestHeaders,
      body: {
        ...(input.redirect_uris.length ? { redirect_uris: input.redirect_uris } : {}),
        client_name: input.client_name,
        token_endpoint_auth_method: input.token_endpoint_auth_method,
        grant_types: input.grant_types,
        ...(input.response_types.length ? { response_types: input.response_types } : {}),
        // 1.7 knows "web" and "native"; a browser (user-agent-based) app is a web client, made
        // public through token_endpoint_auth_method "none".
        ...(input.type ? { application_type: input.type === "native" ? "native" : "web" } : {}),
        skip_consent: input.skip_consent,
        ...(input.subject_type ? { subject_type: input.subject_type } : {}),
        ...(input.backchannel_logout_uri ? { backchannel_logout_uri: input.backchannel_logout_uri } : {}),
        ...(input.backchannel_logout_session_required !== undefined
          ? { backchannel_logout_session_required: input.backchannel_logout_session_required }
          : {}),
        ...(input.jwks ? { jwks: input.jwks } : {}),
        enable_end_session: input.enable_end_session,
        ...(input.post_logout_redirect_uris?.length
          ? { post_logout_redirect_uris: input.post_logout_redirect_uris }
          : {}),
        ...(input.logo_uri ? { logo_uri: input.logo_uri } : {}),
        scope: input.scope,
        ...machineScopes(input.grant_types, input.scope),
        ...(input.policy_uri ? { policy_uri: input.policy_uri } : {}),
        ...(input.tos_uri ? { tos_uri: input.tos_uri } : {}),
      },
    }))) as unknown as OAuthClientAdminPayload;
  } catch (e) {
    throwFromBetterAuthCall(e);
  }
  const clientId = (data as { client_id?: unknown }).client_id;
  // Unmarked, the client would pass for a self-registered one: delete it rather than leave it.
  const marked = typeof clientId === "string" && (await markAdminRegisteredClient(clientId).catch(() => false));
  if (!marked) {
    await discardClient(clientId);
    throw new Error("Could not register the OAuth client");
  }
  try {
    for (const identifier of input.resources) {
      await auth.api.adminLinkClientResource({ headers: requestHeaders, params: { identifier, client_id: clientId } });
    }
  } catch (e) {
    // Its links go with it (the foreign key cascades).
    await discardClient(clientId);
    throwFromBetterAuthCall(e);
  }
  return data;
}

/** Deletes an admin-registered client (Better Auth's endpoint, called on the server). */
export async function deleteOAuthClientForAdmin(requestHeaders: Headers, clientId: string): Promise<void> {
  try {
    await auth.api.deleteOAuthClient({ headers: requestHeaders, body: { client_id: clientId } });
  } catch (e) {
    throwFromBetterAuthCall(e);
  }
}

async function storedClientSecret(clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ clientSecret: oauthClient.clientSecret })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  if (!row) throw new NotFoundError("OAuth client not found");
  return row.clientSecret;
}

/**
 * Issues a new secret for an admin-registered confidential client; returns it once. With a
 * grace period, the previous secret keeps working until it ends (client-secret-grace.ts), and
 * the payload says when (`previous_secret_expires_at`, Unix seconds).
 */
export async function rotateOAuthClientSecretForAdmin(
  requestHeaders: Headers,
  clientId: string,
  grace: SecretGracePeriod = "none",
): Promise<OAuthClientAdminPayload> {
  const previous = SECRET_GRACE_PERIODS[grace] > 0 ? await storedClientSecret(clientId) : null;
  let data: OAuthClientAdminPayload;
  try {
    data = (await auth.api.rotateClientSecret({ headers: requestHeaders, body: { client_id: clientId } })) as unknown as OAuthClientAdminPayload;
  } catch (e) {
    throwFromBetterAuthCall(e);
  }
  if (!previous) return data;
  const expiresAt = new Date(Date.now() + SECRET_GRACE_PERIODS[grace] * 1000);
  const rotated = await storedClientSecret(clientId);
  if (!rotated) return data;
  await db
    .update(oauthClient)
    .set({ clientSecret: withPreviousSecret(rotated, previous, expiresAt) })
    .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.clientSecret, rotated)));
  return { ...data, previous_secret_expires_at: Math.floor(expiresAt.getTime() / 1000) };
}

/** Ends a rotation's grace period now: only the current secret works. */
export async function revokePreviousClientSecret(clientId: string): Promise<void> {
  const stored = await storedClientSecret(clientId);
  if (!stored) throw new BadRequestError("This app has no client secret.");
  const { current } = parseStoredClientSecret(stored);
  if (current === stored) return;
  await db
    .update(oauthClient)
    .set({ clientSecret: current, updatedAt: new Date() })
    .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.clientSecret, stored)));
}

/** Admin-registered clients whose previous secret still works, and until when. */
export async function previousSecretExpiries(): Promise<Record<string, string>> {
  const rows = await db
    .select({ clientId: oauthClient.clientId, clientSecret: oauthClient.clientSecret })
    .from(oauthClient)
    .where(like(oauthClient.clientSecret, "%:%"));
  const out: Record<string, string> = {};
  for (const row of rows) {
    const expiry = previousSecretExpiry(row.clientSecret);
    if (expiry) out[row.clientId] = expiry.toISOString();
  }
  return out;
}

/** Links a client to the APIs in `identifiers` it is not linked to yet. */
async function linkNewResources(requestHeaders: Headers, clientId: string, identifiers: readonly string[]) {
  if (identifiers.length === 0) return;
  const linked = await db
    .select({ identifier: oauthResource.identifier })
    .from(oauthClientResource)
    .innerJoin(oauthResource, eq(oauthResource.id, oauthClientResource.resourceId))
    .where(and(eq(oauthClientResource.clientId, clientId), inArray(oauthResource.identifier, [...identifiers])));
  const already = new Set(linked.map((row) => row.identifier));
  for (const identifier of identifiers) {
    if (already.has(identifier)) continue;
    await auth.api.adminLinkClientResource({ headers: requestHeaders, params: { identifier, client_id: clientId } });
  }
}

/** Why a scope change is refused for a client with these grants, or null. */
function scopeUpdateError(grantTypes: readonly string[] | null | undefined, scope: string | null): string | null {
  if (!isMachineClient(grantTypes)) return null;
  if (scope === null) return "A machine-to-machine client must keep explicit API scopes.";
  const oidc: readonly string[] = OIDC_SCOPES;
  return scope.split(" ").some((sc) => oidc.includes(sc))
    ? "A machine-to-machine client may only have API scopes."
    : null;
}

/**
 * Updates an OAuth client using Better Auth’s server-only admin API. A null `logo_uri`,
 * `policy_uri`, `tos_uri` or `scope` clears that field, and an empty `post_logout_redirect_uris`
 * clears those URIs. A machine-to-machine client keeps explicit API scopes (its
 * client_credentials scopes follow), and is linked to the APIs in `resources` it was not
 * linked to.
 */
export async function updateOAuthClientForAdmin(
  requestHeaders: Headers,
  clientId: string,
  input: UpdateOAuthClientAdminInput,
): Promise<OAuthClientAdminPayload> {
  const {
    device_code: deviceCode,
    logo_uri: logoUri,
    post_logout_redirect_uris: postLogoutUris,
    scope,
    resources = [],
    policy_uri: policyUri,
    tos_uri: tosUri,
    backchannel_logout_uri: backchannelLogoutUri,
    jwks,
    ...rest
  } = input;
  const clearPostLogoutUris = postLogoutUris !== undefined && postLogoutUris.length === 0;
  let grantTypes: string[] | undefined;
  let storedGrantTypes: string[] | null = null;
  const backchannel = backchannelLogoutUri !== undefined || rest.backchannel_logout_session_required !== undefined;
  if (deviceCode !== undefined || scope !== undefined || jwks !== undefined || backchannel) {
    const [row] = await db
      .select({ grantTypes: oauthClient.grantTypes, authMethod: oauthClient.tokenEndpointAuthMethod })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId))
      .limit(1);
    if (!row) throw new NotFoundError("OAuth client not found");
    storedGrantTypes = row.grantTypes;
    if (jwks !== undefined && row.authMethod !== "private_key_jwt") {
      throw new BadRequestError("Only an app that authenticates with private_key_jwt has keys to replace.");
    }
    if (backchannel && isMachineClient(row.grantTypes)) {
      throw new BadRequestError(BACKCHANNEL_WITHOUT_USERS_MESSAGE);
    }
  }
  if (deviceCode !== undefined) {
    // Better Auth replaces the whole grant list, so start from the stored one.
    const refused = deviceCodeUpdateError(storedGrantTypes, deviceCode);
    if (refused) throw new BadRequestError(refused);
    grantTypes = withDeviceCodeGrant(storedGrantTypes, deviceCode);
  }
  if (scope !== undefined) {
    const refused = scopeUpdateError(storedGrantTypes, scope);
    if (refused) throw new BadRequestError(refused);
  }
  const update = {
    ...rest,
    ...(logoUri ? { logo_uri: logoUri } : {}),
    ...(postLogoutUris?.length ? { post_logout_redirect_uris: postLogoutUris } : {}),
    ...(policyUri ? { policy_uri: policyUri } : {}),
    ...(tosUri ? { tos_uri: tosUri } : {}),
    ...(backchannelLogoutUri ? { backchannel_logout_uri: backchannelLogoutUri } : {}),
    ...(scope ? { scope, ...machineScopes(grantTypes ?? storedGrantTypes ?? undefined, scope) } : {}),
  };
  const clears = {
    ...(logoUri === null ? { icon: null } : {}),
    ...(clearPostLogoutUris ? { postLogoutRedirectUris: null } : {}),
    // No scope list: the app may request every scope (Better Auth's default).
    ...(scope === null ? { scopes: null } : {}),
    ...(policyUri === null ? { policy: null } : {}),
    ...(tosUri === null ? { tos: null } : {}),
    ...(backchannelLogoutUri === null ? { backchannelLogoutUri: null, backchannelLogoutSessionRequired: null } : {}),
    // Better Auth's update takes no keys: they are written here, checked by clientJwksError.
    ...(jwks ? { jwks: JSON.stringify(jwks) } : {}),
  };
  let payload: OAuthClientAdminPayload;
  try {
    await linkNewResources(requestHeaders, clientId, resources);
    const data = await auth.api.adminUpdateOAuthClient({
      headers: requestHeaders,
      body: {
        client_id: clientId,
        update: { ...update, ...(grantTypes ? { grant_types: grantTypes } : {}) },
      },
    });
    payload = data as unknown as OAuthClientAdminPayload;
  } catch (e) {
    throwFromBetterAuthCall(e);
  }
  // Better Auth only takes a string and a non-empty list: cleared fields are set to null here
  // once it has accepted the rest of the update.
  if (Object.keys(clears).length > 0) {
    await db
      .update(oauthClient)
      .set({ ...clears, updatedAt: new Date() })
      .where(eq(oauthClient.clientId, clientId));
    if (logoUri === null) delete payload.logo_uri;
    if (clearPostLogoutUris) delete payload.post_logout_redirect_uris;
    if (scope === null) delete payload.scope;
    if (policyUri === null) delete payload.policy_uri;
    if (tosUri === null) delete payload.tos_uri;
    if (backchannelLogoutUri === null) {
      delete payload.backchannel_logout_uri;
      delete payload.backchannel_logout_session_required;
    }
    if (jwks) payload.jwks = jwks;
  }
  return payload;
}

/** A stored client in the OAuth metadata form Better Auth's /oauth2/get-clients answers with. */
function toOAuthMetadata(row: typeof oauthClient.$inferSelect): OAuthClientAdminPayload {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed: unknown = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
  } catch {
    // Unreadable metadata: the client is listed without it.
  }
  const seconds = (date: Date | null) => (date ? Math.round(date.getTime() / 1000) : undefined);
  const out: Record<string, unknown> = {
    ...metadata,
    client_id: row.clientId,
    client_name: row.name ?? undefined,
    client_id_issued_at: seconds(row.createdAt),
    scope: row.scopes?.join(" ") ?? undefined,
    logo_uri: row.icon ?? undefined,
    policy_uri: row.policy ?? undefined,
    tos_uri: row.tos ?? undefined,
    redirect_uris: row.redirectUris ?? [],
    post_logout_redirect_uris: row.postLogoutRedirectUris ?? undefined,
    token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? undefined,
    grant_types: row.grantTypes ?? undefined,
    response_types: row.responseTypes ?? undefined,
    application_type: row.applicationType ?? undefined,
    backchannel_logout_uri: row.backchannelLogoutUri ?? undefined,
    backchannel_logout_session_required: row.backchannelLogoutSessionRequired ?? undefined,
    jwks: row.jwks ? (JSON.parse(row.jwks) as unknown) : undefined,
    subject_type: row.subjectType ?? undefined,
    disabled: row.disabled ?? undefined,
    skip_consent: row.skipConsent ?? undefined,
    enable_end_session: row.enableEndSession ?? undefined,
    reference_id: row.referenceId ?? undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined));
}

/**
 * Every client the platform's admins manage (`reference_id` = the platform), for the
 * Applications page. Better Auth's /oauth2/get-clients returns at most 100 (its adapter's
 * default limit), so the console reads them here.
 */
export async function listPlatformClients(): Promise<OAuthClientAdminPayload[]> {
  const rows = await db
    .select()
    .from(oauthClient)
    .where(eq(oauthClient.referenceId, PLATFORM_CLIENT_REFERENCE))
    .orderBy(asc(oauthClient.createdAt));
  return rows.map(toOAuthMetadata);
}
