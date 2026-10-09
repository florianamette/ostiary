import type { ApiKeyListItem } from "@ostiary/core/lib/api-keys";
import type { AdminApiKeyRow } from "@/components/admin/api-keys/api-keys-table";

/** Keys as the client table takes them (dates as ISO strings). */
export function toAdminApiKeyRows(keys: ApiKeyListItem[]): AdminApiKeyRow[] {
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    start: key.start,
    api: key.api,
    apiName: key.apiName,
    scopes: key.scopes,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    owner:
      key.owner.type === "organization"
        ? { type: "organization", id: key.owner.id, label: key.owner.name }
        : { type: "user", id: key.owner.id, label: key.owner.email },
    createdBy: key.createdBy ? { id: key.createdBy.id, email: key.createdBy.email } : null,
  }));
}
