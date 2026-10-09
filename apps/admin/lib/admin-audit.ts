import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { recordAudit, type AuditEntry } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { requireAdminSession } from "@/lib/require-admin-session";

/**
 * For admin server actions: checks the caller is an admin and returns a function that
 * records an audit entry in their name, with their IP.
 */
export async function adminActor() {
  const session = await requireAdminSession();
  const ip = clientIp(await headers());
  const actor = { id: session.user.id, email: session.user.email };
  return {
    session,
    audit: (entry: Omit<AuditEntry, "actor" | "ipAddress">) =>
      recordAudit({ ...entry, actor, ipAddress: ip }),
  };
}

/**
 * Returns a function giving the translated label of an audit action, from
 * `admin.pages.audit.actions.<area>.<verb>` (action "user.set_role" -> actions.user.set_role).
 * Unknown actions fall back to the raw id.
 */
export async function getAuditActionLabel(locale: string) {
  const t = await getTranslations({ locale, namespace: "admin.pages.audit.actions" });
  return (action: string) => (/^[a-z_]+\.[a-z_]+$/.test(action) && t.has(action) ? t(action) : action);
}
