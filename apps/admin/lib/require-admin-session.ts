import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { adminAccess } from "@ostiary/core/lib/admin/admin-access";
import { auth } from "@/lib/auth";

/**
 * For server components that read the database directly. The (console) layout already
 * redirects non-admins, but pages render alongside the layout, so each data-reading page
 * checks on its own as well. Server actions go through here too (see adminActor), so an
 * admin who still has to turn on two-factor authentication cannot run them.
 */
export async function requireAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || adminAccess(session.user) !== "ok") notFound();
  return session;
}
