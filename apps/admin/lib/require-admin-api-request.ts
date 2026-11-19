import { headers } from "next/headers";

import { adminAccess } from "@ostiary/core/lib/admin/admin-access";
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

const FAILURES = {
  signed_out: { status: 401, message: "Unauthorized" },
  not_admin: { status: 403, message: "Forbidden" },
  needs_2fa: { status: 403, message: "Turn on two-factor authentication to use admin features." },
} as const;

/** The admin behind an admin API request, or why there is none (401 or 403). */
export async function requireAdminApiRequest(): Promise<
  AdminApiAuthSuccess | AdminApiAuthFailure
> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const access = adminAccess(session?.user);
  if (!session || access !== "ok") {
    return { ok: false, ...FAILURES[access === "ok" ? "signed_out" : access] };
  }
  return {
    ok: true,
    requestHeaders: new Headers(h),
    actor: { id: session.user.id, email: session.user.email },
  };
}
