import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { auth } from "@/lib/auth";

/**
 * For server components that read the database directly. The (console) layout already
 * redirects non-admins, but pages render alongside the layout, so each data-reading page
 * checks on its own as well.
 */
export async function requireAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !userHasAdminRole(session.user.role, ["admin"])) notFound();
  return session;
}
