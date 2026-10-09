import type { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tryGetCurrentAuthEndpointContext } from "@better-auth/core/context";
import { sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthResource } from "@ostiary/core/db/schema";
import { ENV_API_SCOPES, unrestrictedApiScopes } from "@ostiary/core/lib/oauth-scopes";

type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;
type FindManyArgs = Parameters<Adapter["findMany"]>[0];
type FindOneArgs = Parameters<Adapter["findOne"]>[0];

/**
 * Per-API access ("every application" or "only linked applications").
 *
 * Better Auth's `enforcePerClientResources` is one switch for every resource: when on, a
 * client gets a token for a resource only if an `oauth_client_resource` row links the two,
 * checked on every grant (authorize, code, refresh, client_credentials, device). Ostiary turns
 * it on, and this adapter wrapper makes the APIs open to every application count as linked to
 * every client: the lookup Better Auth runs for that check (all links of one client) also
 * returns a link to each of them. Nothing is written; linked-only APIs keep the real rows.
 *
 * Only that lookup is extended. The other link query (introspection: may this client, as a
 * resource server, introspect a token for these APIs?) filters on the resource too, so it
 * still sees real links only.
 */
export function withOpenApiLinks(factory: AdapterFactory): AdapterFactory {
  return (options) => {
    const adapter = factory(options);
    const findMany = adapter.findMany.bind(adapter);
    adapter.findMany = (async (args: FindManyArgs) => {
      const rows = await findMany(args);
      const clientId = linksOfClient(args);
      if (clientId === null) return rows;
      const linked = new Set((rows as { resourceId?: string }[]).map((row) => row.resourceId));
      const open = (await openApiIdentifiers()).filter((identifier) => !linked.has(identifier));
      return [...rows, ...open.map((resourceId) => ({ id: `open:${resourceId}`, clientId, resourceId, createdAt: null }))];
    }) as Adapter["findMany"];
    return adapter;
  };
}

/** The client id when `args` asks for every link of one client (Better Auth's linkage check). */
export function linksOfClient(args: FindManyArgs): string | null {
  if (args.model !== "oauthClientResource" || args.limit !== undefined) return null;
  const where = args.where ?? [];
  if (where.length !== 1) return null;
  const [clause] = where;
  if (clause.field !== "clientId" || (clause.operator ?? "eq") !== "eq" || typeof clause.value !== "string") return null;
  return clause.value;
}

/** Identifiers of the APIs open to every application (`metadata.access` is not "linked"). */
async function openApiIdentifiers(): Promise<string[]> {
  const rows = await db
    .select({ identifier: oauthResource.identifier })
    .from(oauthResource)
    .where(sql`coalesce(${oauthResource.metadata}->>'access', '') <> 'linked'`);
  return rows.map((row) => row.identifier);
}

/**
 * Binds API scopes to their API. Better Auth only narrows the scopes of a token for an API
 * when the API lists `allowedScopes` ("Restrict" in the console); otherwise a token for API B
 * could carry API A's scopes. This wrapper gives every unrestricted API, as Better Auth reads
 * it when it issues a token (authorize, code, refresh, client credentials, device), the
 * allowed list of `unrestrictedApiScopes`: its own scopes, the OpenID Connect ones and the
 * scopes no other API declares. Nothing is written; the admin endpoints see the stored row.
 */
export function withApiScopeBinding(factory: AdapterFactory): AdapterFactory {
  return (options) => {
    const adapter = factory(options);
    const findOne = adapter.findOne.bind(adapter);
    adapter.findOne = (async (args: FindOneArgs) => {
      const row = await findOne(args);
      const identifier = resourceByIdentifier(args);
      if (!row || identifier === null) return row;
      if ((row as { allowedScopes?: unknown }).allowedScopes != null) return row;
      if (tryGetCurrentAuthEndpointContext()?.path?.startsWith("/admin/")) return row;
      const rows = await db
        .select({ identifier: oauthResource.identifier, allowedScopes: oauthResource.allowedScopes, metadata: oauthResource.metadata })
        .from(oauthResource);
      return { ...row, allowedScopes: unrestrictedApiScopes(identifier, rows, ENV_API_SCOPES) };
    }) as Adapter["findOne"];
    return adapter;
  };
}

/** The identifier when `args` looks up one API by its identifier (Better Auth's getResource). */
export function resourceByIdentifier(args: FindOneArgs): string | null {
  if (args.model !== "oauthResource") return null;
  const where = args.where ?? [];
  if (where.length !== 1) return null;
  const [clause] = where;
  if (clause.field !== "identifier" || (clause.operator ?? "eq") !== "eq" || typeof clause.value !== "string") return null;
  return clause.value;
}
