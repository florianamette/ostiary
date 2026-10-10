/**
 * An OAuth app's icon, looked up and served by the admin app (admins only, see /api/admin/app-icon).
 * The browser keeps icons for a week, so pass the app's `logo_uri` where it is known: a new one
 * gives a new URL and shows at once.
 */
export function adminAppIconUrl(clientId: string, logoUri?: string | null) {
  const path = `/api/admin/app-icon/${encodeURIComponent(clientId)}`;
  return logoUri ? `${path}?v=${shortHash(logoUri)}` : path;
}

/** FNV-1a, in base 36: enough to tell icon URLs apart. */
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
