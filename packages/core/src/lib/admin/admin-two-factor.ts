import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";

type UserWithTwoFactor = {
  role?: string | null;
  twoFactorEnabled?: boolean | null;
};

/**
 * True when this user is a platform admin who has not turned on two-factor authentication
 * yet, while the deployment requires it (REQUIRE_ADMIN_2FA). Such an admin can still use
 * their own account, but not the admin console or the admin endpoints.
 */
export function adminNeedsTwoFactor(
  user: UserWithTwoFactor | null | undefined,
  required: boolean,
): boolean {
  if (!required || !user) return false;
  return userHasAdminRole(user.role, ["admin"]) && !user.twoFactorEnabled;
}
