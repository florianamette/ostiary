import { headers } from "next/headers";

import { recordAudit, type AuditEntry } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { signedInRecently } from "@ostiary/core/lib/recent-sign-in";
import { auth } from "@/lib/auth";

export { signedInRecently };

/** The session of the request, with its headers (for the audit log's IP address). */
export async function currentSession() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { session, requestHeaders };
}

export type UserActorError = "signedOut" | "impersonating" | "recentSignIn";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * For the dashboard's server actions: the signed-in person, checked as the action needs, and a
 * function that records an audit entry in their name with their IP (like the admin app's
 * adminActor).
 * - `forbidImpersonation`: an admin viewing the account cannot run it.
 * - `recentSignIn`: needs a sign-in from the last 10 minutes (lib/recent-sign-in.ts).
 */
export async function userActor(
  options: { forbidImpersonation?: boolean; recentSignIn?: boolean } = {},
): Promise<
  | {
      ok: true;
      session: Session;
      user: Session["user"];
      audit: (entry: Omit<AuditEntry, "actor" | "ipAddress">) => Promise<void>;
    }
  | { ok: false; error: UserActorError }
> {
  const { session, requestHeaders } = await currentSession();
  if (!session) return { ok: false, error: "signedOut" };
  if (options.forbidImpersonation && session.session.impersonatedBy) return { ok: false, error: "impersonating" };
  if (options.recentSignIn && !signedInRecently(session.session.createdAt)) return { ok: false, error: "recentSignIn" };
  const actor = { id: session.user.id, email: session.user.email };
  const ipAddress = clientIp(requestHeaders);
  return {
    ok: true,
    session,
    user: session.user,
    audit: (entry) => recordAudit({ ...entry, actor, ipAddress }),
  };
}
