import type { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthResource } from "@ostiary/core/db/schema";

type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;
type FindManyArgs = Parameters<Adapter["findMany"]>[0];

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
