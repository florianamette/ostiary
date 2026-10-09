import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { defaultKeyHasher } from "@better-auth/api-key";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@ostiary/core/db/index";
import { apikey, oauthClientResource, organization, user } from "@ostiary/core/db/schema";
import {
  API_KEY_VERIFY_PATH,
  checkKeyForApi,
  keyOwnerType,
  organizationMayOwnKeys,
  parseKeyGrant,
  pluginErrorToVerifyError,
  type VerifyError,
} from "@ostiary/core/lib/api-key-policy";
import { currentApiKeySettings, findKeyApi } from "@ostiary/core/lib/api-keys";
import { clientRegistrationSource } from "@ostiary/core/lib/client-registration";

type ProviderOptions = Parameters<typeof getOAuthProviderApi>[1];

/** The plugin's server-only verification endpoint (`apiKey().endpoints.verifyApiKey`). */
type VerifyEndpoint = (input: never) => Promise<unknown>;

type PluginVerifyResult = {
  valid: boolean;
  error: { code?: string; details?: { tryAgainIn?: number } } | null;
  key: { id: string; referenceId: string; expiresAt: Date | string | null } | null;
};

export type ApiKeyVerification =
  | {
      valid: true;
      keyId: string;
      /** Who the key belongs to. Organization keys outlive the member who created them. */
      ownerType: "user" | "organization";
      /** The owning user, or null for an organization's key. */
      userId: string | null;
      /** Only for an organization's key. */
      organizationId?: string;
      api: string;
      scopes: string[];
      expiresAt: string | null;
    }
  | { valid: false; error: VerifyError; retryAfter?: number };

/**
 * POST /api/auth/api-key/verify: an API checks a key a script sent it.
 *
 * The @better-auth/api-key plugin's own verification is server-only (no HTTP route), and
 * knows nothing about Ostiary's APIs. This endpoint wraps it for resource servers:
 *
 * - The caller authenticates as a confidential OAuth client registered by an admin, exactly
 *   as at /oauth2/introspect (client_secret_basic, client_secret_post or private_key_jwt,
 *   checked by the OAuth provider itself). Public and self-registered clients are refused.
 * - The caller names its API (`resource`) and must be linked to it on the admin APIs page,
 *   the same rule Better Auth applies before a resource server may introspect a token.
 * - A key for another API gets the same answer as an unknown key, before the key's usage or
 *   rate limit is touched. So does the key of a banned or deleted user, or of a deleted
 *   organization. The answer says who owns the key: `ownerType` "user" with `userId`, or
 *   "organization" with `organizationId` (and `userId: null`). Then the plugin checks it (expiry, rate limit) and records its use.
 */
export function apiKeyVerification({
  providerOptions,
  verifyApiKey,
  authServer,
}: {
  providerOptions: ProviderOptions;
  verifyApiKey: VerifyEndpoint;
  authServer: string;
}) {
  return {
    id: "ostiary-api-key-verification",
    endpoints: {
      ostiaryVerifyApiKey: createAuthEndpoint(
        API_KEY_VERIFY_PATH,
        {
          method: "POST",
          // The OAuth provider reads form-encoded client credentials from the request.
          cloneRequest: true,
          body: z.object({
            key: z.string().min(1).max(512),
            resource: z.string().min(1).max(2048),
            client_id: z.string().optional(),
            client_secret: z.string().optional(),
            client_assertion: z.string().optional(),
            client_assertion_type: z.string().optional(),
          }),
          metadata: {
            noStore: true,
            allowedMediaTypes: ["application/x-www-form-urlencoded", "application/json"],
          },
        },
        async (ctx) => {
          // Throws 401 invalid_client for unknown, disabled or public clients and wrong secrets.
          const { client } = await getOAuthProviderApi(ctx, providerOptions).authenticateClient();
          if ((await clientRegistrationSource(client.clientId)) !== "admin") {
            throw new APIError("UNAUTHORIZED", {
              error: "invalid_client",
              error_description: "Only applications registered by an admin can verify API keys",
            });
          }
          const { key, resource } = ctx.body;
          const [link] = await db
            .select({ id: oauthClientResource.id })
            .from(oauthClientResource)
            .where(and(eq(oauthClientResource.clientId, client.clientId), eq(oauthClientResource.resourceId, resource)))
            .limit(1);
          if (!link) {
            throw new APIError("FORBIDDEN", {
              error: "access_denied",
              error_description: "This application is not linked to that API (admin console, APIs, Access)",
            });
          }

          const answer = (result: ApiKeyVerification) => ctx.json(result);
          if (!(await currentApiKeySettings()).enabled) return answer({ valid: false, error: "api_keys_disabled" });

          const [row] = await db
            .select({ permissions: apikey.permissions, referenceId: apikey.referenceId, configId: apikey.configId })
            .from(apikey)
            .where(eq(apikey.key, await defaultKeyHasher(key)))
            .limit(1);
          if (!row) return answer({ valid: false, error: "invalid_key" });
          const ownerType = keyOwnerType(row.configId);
          let owner: { banned: boolean | null; banExpires: Date | null } | null = null;
          if (ownerType === "organization") {
            // An organization has no ban: its key is good while the organization exists.
            const [org] = organizationMayOwnKeys(row.referenceId)
              ? await db
                  .select({ id: organization.id })
                  .from(organization)
                  .where(eq(organization.id, row.referenceId))
                  .limit(1)
              : [];
            owner = org ? { banned: false, banExpires: null } : null;
          } else {
            [owner = null] = await db
              .select({ banned: user.banned, banExpires: user.banExpires })
              .from(user)
              .where(eq(user.id, row.referenceId))
              .limit(1);
          }
          const checked = checkKeyForApi({
            grant: parseKeyGrant(row.permissions),
            requestedApi: resource,
            api: await findKeyApi(resource),
            authServer,
            owner,
          });
          if (!checked.ok) return answer({ valid: false, error: checked.error });

          // The plugin's checks: enabled, expiry (deletes expired keys), per-key rate limit.
          const verified = (await verifyApiKey({
            ...ctx,
            body: { key },
            asResponse: false,
            returnHeaders: false,
            returnStatus: false,
          } as never)) as PluginVerifyResult;
          if (!verified.valid || !verified.key) {
            const error = pluginErrorToVerifyError(verified.error?.code);
            const tryAgainIn = verified.error?.details?.tryAgainIn;
            return answer({
              valid: false,
              error,
              ...(error === "rate_limited" && typeof tryAgainIn === "number"
                ? { retryAfter: Math.ceil(tryAgainIn / 1000) }
                : {}),
            });
          }
          const expiresAt = verified.key.expiresAt ? new Date(verified.key.expiresAt).toISOString() : null;
          return answer({
            valid: true,
            keyId: verified.key.id,
            ...(ownerType === "organization"
              ? { ownerType, userId: null, organizationId: verified.key.referenceId }
              : { ownerType, userId: verified.key.referenceId }),
            api: resource,
            scopes: checked.scopes,
            expiresAt,
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
