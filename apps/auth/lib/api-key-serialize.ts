import type { ApiKeyListItem } from "@ostiary/core/lib/api-keys";

/** A key as the dashboard shows it (dates as ISO strings). Never the key itself. */
export type MyApiKey = {
  id: string;
  name: string;
  start: string | null;
  api: string | null;
  apiName: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  /** Organization keys only: who created it (name or email), if that account still exists. */
  createdBy?: string | null;
};

export function serializeApiKey(key: ApiKeyListItem): MyApiKey {
  return {
    id: key.id,
    name: key.name,
    start: key.start,
    api: key.api,
    apiName: key.apiName,
    scopes: key.scopes,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    ...(key.owner.type === "organization" ? { createdBy: key.createdBy ? key.createdBy.name || key.createdBy.email : null } : {}),
  };
}
