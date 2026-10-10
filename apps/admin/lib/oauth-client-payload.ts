/** Readers for the loosely typed JSON that Better Auth's client API and the admin routes return. */

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Response from `getClients` is an array of RFC-style client objects (snake_case). */
export function normalizeGetClientsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = asRecord(data);
  if (o && Array.isArray(o.clients)) return o.clients;
  return [];
}

/** The `error` of an admin route's JSON answer, if any. */
export function routeError(json: unknown): string | null {
  const o = asRecord(json);
  return o && typeof o.error === "string" ? o.error : null;
}

/** Redirect URIs as typed in a textarea: one per line or comma-separated. */
export function parseRedirectUris(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
