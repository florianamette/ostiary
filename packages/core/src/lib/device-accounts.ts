/** Accounts a browser can be signed in to at once (multiSession plugin, account menu, select-account). */
export const MAX_DEVICE_SESSIONS = 5;

export type DeviceAccount = {
  /** Session token, needed to switch to or sign out of this account. */
  token: string;
  userId: string;
  name: string;
  email: string;
};

type DeviceSessionRow = {
  session: { token: string };
  user: { id: string; name?: string | null; email: string };
};

/** The accounts from `listDeviceSessions`, the active one first, then by email. */
export function orderDeviceAccounts(rows: DeviceSessionRow[], activeUserId: string | undefined): DeviceAccount[] {
  const accounts = rows.map((row) => ({
    token: row.session.token,
    userId: row.user.id,
    name: row.user.name ?? "",
    email: row.user.email,
  }));
  return [
    ...accounts.filter((a) => a.userId === activeUserId),
    ...accounts.filter((a) => a.userId !== activeUserId).sort((a, b) => a.email.localeCompare(b.email)),
  ];
}

/**
 * Login URL that signs in one more account instead of replacing the current one: the auth
 * app's proxy lets signed-in visitors through when `addAccount=1`. `query` carries an OAuth
 * request along; its signature only covers the parameters it lists, so the extra one is ignored.
 */
export function addAccountHref(locale: string, query?: string | URLSearchParams): string {
  const params = new URLSearchParams(query);
  params.set("addAccount", "1");
  return `/${locale}/login?${params.toString()}`;
}
