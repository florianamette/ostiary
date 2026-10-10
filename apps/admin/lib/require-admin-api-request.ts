import { headers } from "next/headers";

import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { env } from "@ostiary/core/lib/env";
import { auth } from "@/lib/auth";

type AdminApiAuthFailure = {
  ok: false;
  status: 401 | 403;
  message: string;
};

type AdminApiAuthSuccess = {
  ok: true;
  requestHeaders: Headers;
  actor: { id: string; email: string };
};

export async function requireAdminApiRequest(): Promise<
  AdminApiAuthSuccess | AdminApiAuthFailure
> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  if (!userHasAdminRole(session.user.role, ["admin"])) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  if (adminNeedsTwoFactor(session.user, env.REQUIRE_ADMIN_2FA === "true")) {
    return { ok: false, status: 403, message: "Turn on two-factor authentication to use admin features." };
  }
  return {
    ok: true,
    requestHeaders: new Headers(h),
    actor: { id: session.user.id, email: session.user.email },
  };
}
