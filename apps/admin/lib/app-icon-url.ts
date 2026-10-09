/** An OAuth app's icon, looked up and served by the admin app (admins only, see /api/admin/app-icon). */
export function adminAppIconUrl(clientId: string) {
  return `/api/admin/app-icon/${encodeURIComponent(clientId)}`;
}
