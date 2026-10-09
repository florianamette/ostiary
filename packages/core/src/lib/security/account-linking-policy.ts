import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";

/*
 * Implicit account linking: signing in with a provider whose (verified) email matches an
 * existing account attaches that provider to it. Better Auth requires both the provider's and
 * the account's email to be verified. Ostiary also refuses it for accounts that protect more:
 * one with two-factor authentication (a new way in would skip its second factor until the next
 * sign-in) and platform admins. Their owners connect a provider from the dashboard instead,
 * signed in, which is an explicit link and not affected.
 */
export function implicitLinkRefusal(user: { role?: string | null; twoFactorEnabled?: boolean | null }): string | null {
  if (userHasAdminRole(user.role, ["admin"])) {
    return "This account is an administrator account. Sign in another way, then connect this provider from your account page.";
  }
  if (user.twoFactorEnabled) {
    return "This account uses two-factor authentication. Sign in another way, then connect this provider from your account page.";
  }
  return null;
}
