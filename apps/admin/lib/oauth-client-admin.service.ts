import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@ostiary/core/db/index";
import { oauthClient } from "@ostiary/core/db/schema";
import { withDeviceCodeGrant } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
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

function messageFromUnknown(error: unknown): string {
  // Better Auth 1.7 OAuth errors carry the reason in the body (`error_description`) and leave
  // `message` empty.
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: unknown }).body;
    if (body && typeof body === "object") {
      const { error_description: description, message } = body as Record<string, unknown>;
      if (typeof description === "string" && description.trim()) return description;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Request failed";
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const o = error as Record<string, unknown>;
  if (typeof o.status === "number") return o.status;
  if (typeof o.statusCode === "number") return o.statusCode;
  return undefined;
}

function throwFromBetterAuthCall(error: unknown): never {
  const status = getHttpStatus(error);
  const message = messageFromUnknown(error);
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

/**
 * Creates an OAuth client using Better Auth’s server-only admin API.
 * Caller must already enforce admin session (e.g. route guard).
 */
export async function createOAuthClientForAdmin(
  requestHeaders: Headers,
  input: CreateOAuthClientAdminInput,
): Promise<OAuthClientAdminPayload> {
  try {
    const data = await auth.api.adminCreateOAuthClient({
      headers: requestHeaders,
      body: {
        redirect_uris: input.redirect_uris,
        client_name: input.client_name,
        token_endpoint_auth_method: input.token_endpoint_auth_method,
        grant_types: input.grant_types,
        ...(input.response_types.length ? { response_types: input.response_types } : {}),
        // 1.7 knows "web" and "native"; a browser (user-agent-based) app is a web client, made
        // public through token_endpoint_auth_method "none".
        ...(input.type ? { application_type: input.type === "native" ? "native" : "web" } : {}),
        skip_consent: input.skip_consent,
        scope: input.scope,
        ...machineScopes(input.grant_types, input.scope),
      },
    });
    return data as unknown as OAuthClientAdminPayload;
  } catch (e) {
    throwFromBetterAuthCall(e);
  }
}

/**
 * Updates an OAuth client using Better Auth’s server-only admin API.
 */
export async function updateOAuthClientForAdmin(
  requestHeaders: Headers,
  clientId: string,
  input: UpdateOAuthClientAdminInput,
): Promise<OAuthClientAdminPayload> {
  const { device_code: deviceCode, ...update } = input;
  let grantTypes: string[] | undefined;
  if (deviceCode !== undefined) {
    // Better Auth replaces the whole grant list, so start from the stored one.
    const [row] = await db
      .select({ grantTypes: oauthClient.grantTypes })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId))
      .limit(1);
    if (!row) throw new NotFoundError("OAuth client not found");
    grantTypes = withDeviceCodeGrant(row.grantTypes, deviceCode);
  }
  try {
    const data = await auth.api.adminUpdateOAuthClient({
      headers: requestHeaders,
      body: {
        client_id: clientId,
        update: { ...update, ...(grantTypes ? { grant_types: grantTypes } : {}) },
      },
    });
    return data as unknown as OAuthClientAdminPayload;
  } catch (e) {
    throwFromBetterAuthCall(e);
  }
}
