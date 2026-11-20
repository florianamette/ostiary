import type { OAuthProviderExtension } from "@better-auth/oauth-provider";

import {
  buildClientClaims,
  claimNeeds,
  type ClaimContext,
  type ClaimToken,
  type ClientClaim,
} from "@ostiary/core/lib/client-claims/policy";
import { activeOrganizationFor, getClientClaims, organizationsOf } from "@ostiary/core/lib/client-claims/store";

type ClaimUser = { id?: unknown; role?: unknown; emailVerified?: unknown; username?: unknown; twoFactorEnabled?: unknown };

/**
 * One request issues an access token and an ID token: their claims hooks share the endpoint
 * context, so the definition is read once per request.
 */
const loaded = new WeakMap<object, Map<string, Promise<ClientClaim[]>>>();

function claimsOf(ctx: object, clientId: string): Promise<ClientClaim[]> {
  let perClient = loaded.get(ctx);
  if (!perClient) loaded.set(ctx, (perClient = new Map()));
  let claims = perClient.get(clientId);
  if (!claims) perClient.set(clientId, (claims = getClientClaims(clientId).then((stored) => stored.claims)));
  return claims;
}

async function claimsFor(
  ctx: object,
  clientId: string | undefined,
  token: ClaimToken,
  user: ClaimUser | null | undefined,
  sessionId: string | undefined,
): Promise<Record<string, unknown>> {
  if (!clientId) return {};
  const claims = await claimsOf(ctx, clientId);
  if (claims.length === 0) return {};
  const needs = claimNeeds(claims, token);
  const userId = typeof user?.id === "string" ? user.id : null;
  // No user (client credentials): only the static claims.
  const context: ClaimContext = {
    user: userId
      ? {
          role: typeof user?.role === "string" ? user.role : null,
          emailVerified: user?.emailVerified === true,
          username: typeof user?.username === "string" ? user.username : null,
          twoFactorEnabled: user?.twoFactorEnabled === true,
        }
      : null,
    organization: userId && needs.organization ? await activeOrganizationFor(sessionId, userId) : null,
    organizations: userId && needs.organizations ? await organizationsOf(userId) : null,
  };
  return buildClientClaims(claims, token, context);
}

/**
 * Adds each application's custom claims (admin console, lib/client-claims) to its tokens,
 * through the oauth-provider's claims extension point: it receives the client, unlike the
 * `custom*Claims` options. Better Auth calls it for every grant (authorization code, refresh,
 * device code, client credentials with no user) and again when introspecting an opaque access
 * token (no session there: the active organization is left out). Extension claims are additive:
 * a claim the server or Ostiary already sets always keeps its value.
 */
export function clientClaimsExtension(): OAuthProviderExtension {
  return {
    claims: {
      accessToken: ({ ctx, client, user, sessionId }) => claimsFor(ctx, client.clientId, "access_token", user, sessionId),
      idToken: ({ ctx, client, user, sessionId }) => claimsFor(ctx, client.clientId, "id_token", user, sessionId),
      userInfo: ({ ctx, client, user, jwt }) => {
        const clientId = client?.clientId ?? (typeof jwt.client_id === "string" ? jwt.client_id : typeof jwt.azp === "string" ? jwt.azp : undefined);
        return claimsFor(ctx, clientId, "userinfo", user, typeof jwt.sid === "string" ? jwt.sid : undefined);
      },
    },
  };
}
