import { env } from "@ostiary/core/lib/env";

/**
 * Protected resources that may receive JWT access tokens: the auth server itself (tokens
 * issued without a `resource` parameter keep it as their audience), then the APIs in
 * OAUTH_API_AUDIENCES. Clients ask for one with the RFC 8707 `resource` parameter.
 *
 * Shared by the Better Auth config and the build-time seed (`db:seed`), so both register
 * the same rows.
 */
export function oauthResourceIdentifiers(baseURL: string): string[] {
  const apiAudiences = (env.OAUTH_API_AUDIENCES ?? "")
    .split(",")
    .map((audience) => audience.trim())
    .filter(Boolean);
  return [...new Set([baseURL, ...apiAudiences])];
}
