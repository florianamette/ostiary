import { headers } from "next/headers";

import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { auth } from "@/lib/auth";

export type AdminApiAuthFailure = {
  ok: false;
  status: 401 | 403;
  message: string;
};

export type AdminApiAuthSuccess = {
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
  return {
    ok: true,
    requestHeaders: new Headers(h),
    actor: { id: session.user.id, email: session.user.email },
  };
}
