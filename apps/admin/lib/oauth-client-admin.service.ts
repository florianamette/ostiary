import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@ostiary/core/db/index";
import { oauthClient } from "@ostiary/core/db/schema";
import { markAdminRegisteredClient } from "@ostiary/core/lib/client-registration";
import {
  deviceCodeUpdateError,
  withDeviceCodeGrant,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
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
 * that grant. Caller must already enforce admin session (e.g. route guard).
 */
export async function createOAuthClientForAdmin(
  requestHeaders: Headers,
  input: CreateOAuthClientAdminInput,
): Promise<OAuthClientAdminPayload> {
  let data: OAuthClientAdminPayload;
  try {
    data = (await auth.api.adminCreateOAuthClient({
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
        enable_end_session: input.enable_end_session,
        ...(input.post_logout_redirect_uris?.length
          ? { post_logout_redirect_uris: input.post_logout_redirect_uris }
          : {}),
        ...(input.logo_uri ? { logo_uri: input.logo_uri } : {}),
        scope: input.scope,
        ...machineScopes(input.grant_types, input.scope),
      },
    })) as unknown as OAuthClientAdminPayload;
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

/** Issues a new secret for an admin-registered confidential client; returns it once. */
export async function rotateOAuthClientSecretForAdmin(
  requestHeaders: Headers,
  clientId: string,
): Promise<OAuthClientAdminPayload> {
  try {
    const data = await auth.api.rotateClientSecret({ headers: requestHeaders, body: { client_id: clientId } });
    return data as unknown as OAuthClientAdminPayload;
  } catch (e) {
    throwFromBetterAuthCall(e);
  }
}

/**
 * Updates an OAuth client using Better Auth’s server-only admin API. A null `logo_uri` clears
 * the icon and an empty `post_logout_redirect_uris` clears those URIs: Better Auth only takes a
 * string and a non-empty list, so the columns are set to null here once Better Auth has
 * accepted the rest of the update.
 */
export async function updateOAuthClientForAdmin(
  requestHeaders: Headers,
  clientId: string,
  input: UpdateOAuthClientAdminInput,
): Promise<OAuthClientAdminPayload> {
  const { device_code: deviceCode, logo_uri: logoUri, post_logout_redirect_uris: postLogoutUris, ...rest } = input;
  const clearPostLogoutUris = postLogoutUris !== undefined && postLogoutUris.length === 0;
  const update = {
    ...rest,
    ...(logoUri ? { logo_uri: logoUri } : {}),
    ...(postLogoutUris?.length ? { post_logout_redirect_uris: postLogoutUris } : {}),
  };
  let grantTypes: string[] | undefined;
  if (deviceCode !== undefined) {
    // Better Auth replaces the whole grant list, so start from the stored one.
    const [row] = await db
      .select({ grantTypes: oauthClient.grantTypes })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId))
      .limit(1);
    if (!row) throw new NotFoundError("OAuth client not found");
    const refused = deviceCodeUpdateError(row.grantTypes, deviceCode);
    if (refused) throw new BadRequestError(refused);
    grantTypes = withDeviceCodeGrant(row.grantTypes, deviceCode);
  }
  let payload: OAuthClientAdminPayload;
  try {
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
  if (logoUri === null || clearPostLogoutUris) {
    await db
      .update(oauthClient)
      .set({
        ...(logoUri === null ? { icon: null } : {}),
        ...(clearPostLogoutUris ? { postLogoutRedirectUris: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(oauthClient.clientId, clientId));
    if (logoUri === null) delete payload.logo_uri;
    if (clearPostLogoutUris) delete payload.post_logout_redirect_uris;
  }
  return payload;
}
