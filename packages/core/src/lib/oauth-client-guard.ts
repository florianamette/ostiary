import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { DEVICE_CODE_GRANT_TYPE } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { deviceCode } from "@ostiary/core/db/schema";
import { clientRegistrationSource, currentClientRegistrationSettings } from "@ostiary/core/lib/client-registration";
import {
  effectiveRegistrationScopes,
  requestClientIds,
  selfRegisteredUpdateError,
} from "@ostiary/core/lib/client-registration-policy";
import { currentApiScopes, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";

type Bag = Record<string, unknown>;

/**
 * Better Auth's client management endpoints served over HTTP. Closed (`disabledPaths`): the
 * admin console creates, updates, rotates and deletes clients on the server, through
 * `auth.api`, after its own admin check. `clientPrivileges` refuses non-admins as well.
 */
export const CLIENT_MANAGEMENT_HTTP_PATHS = [
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/delete-client",
];

/** Client updates: Better Auth's endpoint and the server-only one the admin console calls. */
const CLIENT_UPDATE_PATHS = new Set(["/oauth2/update-client", "/admin/oauth2/update-client"]);

function refuseDeviceFlow(): never {
  throw new APIError("BAD_REQUEST", {
    error: "unauthorized_client",
    error_description: "Self-registered clients cannot use device sign-in",
  });
}

async function isAdminRegistered(clientId: string): Promise<boolean> {
  return (await clientRegistrationSource(clientId)) === "admin";
}

/**
 * Rules for OAuth clients that Better Auth's options cannot express:
 *
 * - Self-registered clients (anything not admin-registered) stay within the self-registration
 *   policy after they exist: an update may not add a scope outside the allowed list, a grant
 *   other than authorization code and refresh token, machine scopes, or skip consent.
 * - Device sign-in shows only the app's name to the user, who types a code elsewhere: an easy
 *   phishing setup for an app nobody reviewed, so it is for admin-registered clients only.
 *   Checked for every client id the request names, however the client authenticates (body,
 *   HTTP Basic, client assertion), and again when the device code is exchanged, against the
 *   client the code was issued to.
 */
export function oauthClientGuard() {
  return {
    id: "ostiary-oauth-client-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => CLIENT_UPDATE_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const body = (ctx.body ?? {}) as Bag;
            const clientId = typeof body.client_id === "string" ? body.client_id : null;
            if (!clientId) return;
            const source = await clientRegistrationSource(clientId);
            if (source === null || source === "admin") return; // Better Auth answers 404 for an unknown client.
            const settings = await currentClientRegistrationSettings();
            const allowed = effectiveRegistrationScopes(settings, [...OIDC_SCOPES, ...(await currentApiScopes())]);
            const refused = selfRegisteredUpdateError(body.update, allowed);
            if (refused) {
              throw new APIError("BAD_REQUEST", { error: "invalid_client_metadata", error_description: refused });
            }
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/device/code",
          handler: createAuthMiddleware(async (ctx) => {
            const ids = requestClientIds(ctx.headers, ctx.body);
            // No client named at all: refused here rather than left to later checks.
            if (ids.length === 0) refuseDeviceFlow();
            for (const id of ids) {
              if (!(await isAdminRegistered(id))) refuseDeviceFlow();
            }
          }),
        },
        {
          matcher: (ctx) =>
            ctx.path === "/oauth2/token" && (ctx.body as Bag | undefined)?.grant_type === DEVICE_CODE_GRANT_TYPE,
          handler: createAuthMiddleware(async (ctx) => {
            const code = (ctx.body as Bag).device_code;
            if (typeof code !== "string" || !code) return; // Better Auth refuses it.
            const [row] = await db
              .select({ oauthClientId: deviceCode.oauthClientId })
              .from(deviceCode)
              .where(eq(deviceCode.deviceCode, code))
              .limit(1);
            if (row?.oauthClientId && !(await isAdminRegistered(row.oauthClientId))) refuseDeviceFlow();
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
