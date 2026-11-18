import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/lib/auth";

/*
 * The discovery documents (OpenID configuration, OAuth authorization server metadata), served
 * at the root (`/.well-known/...`) and under Better Auth's base path (`/api/auth/.well-known/...`,
 * `/.well-known/oauth-authorization-server/api/auth`, RFC 8414's form for an issuer with a path).
 * One implementation for all of them: Better Auth's handlers, cached briefly, readable from any
 * origin. Browser apps (single-page apps, MCP clients) fetch them cross-origin; they are public.
 */

const DISCOVERY_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
};

/** GET for an OpenID configuration route. */
export const openIdConfiguration = oauthProviderOpenIdConfigMetadata(auth, { headers: DISCOVERY_HEADERS });

/** GET for an OAuth authorization server metadata route. */
export const authorizationServerMetadata = oauthProviderAuthServerMetadata(auth, { headers: DISCOVERY_HEADERS });

/** OPTIONS (CORS preflight) for the discovery routes. */
export function discoveryPreflight(): Response {
  return new Response(null, { status: 204, headers: DISCOVERY_HEADERS });
}
