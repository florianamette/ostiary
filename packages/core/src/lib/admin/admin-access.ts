import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { isPlatformAdmin } from "@ostiary/core/lib/admin/user-has-admin-role";
import { env } from "@ostiary/core/lib/env";

type AdminCandidate = {
  role?: string | null;
  twoFactorEnabled?: boolean | null;
};

/**
 * Whether this user may use the admin console and the admin endpoints:
 * - `signed_out`: no user
 * - `not_admin`: signed in without the platform `admin` role
 * - `needs_2fa`: an admin without two-factor authentication while REQUIRE_ADMIN_2FA is on
 * - `ok`: allowed
 *
 * The one place this rule is written; the admin proxy, layout, server actions and API routes
 * map the result to a redirect or an HTTP status.
 */
export type AdminAccess = "signed_out" | "not_admin" | "needs_2fa" | "ok";

export function adminAccess(
  user: AdminCandidate | null | undefined,
  requireTwoFactor: boolean = env.REQUIRE_ADMIN_2FA === "true",
): AdminAccess {
  if (!user) return "signed_out";
  if (!isPlatformAdmin(user.role)) return "not_admin";
  if (adminNeedsTwoFactor(user, requireTwoFactor)) return "needs_2fa";
  return "ok";
}
