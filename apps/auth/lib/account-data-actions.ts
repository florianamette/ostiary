"use server";

import { and, count, eq, gt, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@ostiary/core/db/index";
import { account, auditLog } from "@ostiary/core/db/schema";
import { accountDeletionBlockers, type DeletionBlocker } from "@ostiary/core/lib/account-data/blockers";
import { accountExportFileName, buildAccountExport } from "@ostiary/core/lib/account-data/export";
import { recordAudit } from "@ostiary/core/lib/audit";
import { RECENT_SIGN_IN_SECONDS } from "@ostiary/core/lib/auth-factory";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { env } from "@ostiary/core/lib/env";
import { getBaseURL } from "@ostiary/core/lib/url";
import { auth } from "@/lib/auth";

/*
 * The dashboard's "Your data" section: export (GDPR access and portability) and what the
 * deletion dialog needs to know. Deletion itself goes through Better Auth's /delete-user, whose
 * checks live in the auth factory so the HTTP endpoint is guarded the same way.
 */

/** Exports per account per hour. Each one reads every table, and is in the audit log. */
const EXPORTS_PER_HOUR = 3;
const EXPORT_ACTION = "user.export_data";

export type ExportError = "signedOut" | "impersonating" | "recentSignIn" | "rateLimited" | "failed";

async function currentSession() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { session, requestHeaders };
}

function signedInRecently(createdAt: Date | string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= RECENT_SIGN_IN_SECONDS * 1000;
}

/**
 * The signed-in account's data as a JSON document, for a download. Like adding a passkey, it
 * needs a sign-in from the last 10 minutes (a borrowed or stolen session should not be able to
 * take everything away at once), and an admin viewing the account cannot use it.
 */
export async function exportMyData(): Promise<{ ok: true; fileName: string; json: string } | { ok: false; error: ExportError }> {
  const { session, requestHeaders } = await currentSession();
  if (!session) return { ok: false, error: "signedOut" };
  if (session.session.impersonatedBy) return { ok: false, error: "impersonating" };
  if (!signedInRecently(session.session.createdAt)) return { ok: false, error: "recentSignIn" };

  const userId = session.user.id;
  // Audit entries are stamped by the database clock (column default), so compare with it too.
  const [recent] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(and(eq(auditLog.actorId, userId), eq(auditLog.action, EXPORT_ACTION), gt(auditLog.createdAt, sql`now() - interval '1 hour'`)));
  if ((recent?.n ?? 0) >= EXPORTS_PER_HOUR) return { ok: false, error: "rateLimited" };

  try {
    const now = new Date();
    const data = await buildAccountExport(db, userId, { instance: env.AUTH_APP_URL ?? getBaseURL(), now });
    if (!data) return { ok: false, error: "signedOut" };
    await recordAudit({
      actor: { id: userId, email: session.user.email },
      action: EXPORT_ACTION,
      target: { type: "user", id: userId, label: session.user.email },
      metadata: { by: "self" },
      ipAddress: clientIp(requestHeaders),
    });
    return { ok: true, fileName: accountExportFileName(userId, now), json: JSON.stringify(data, null, 2) };
  } catch (error) {
    console.error("Could not export account data", error);
    return { ok: false, error: "failed" };
  }
}

export type DeletionStatus = {
  email: string;
  blockers: DeletionBlocker[];
  /** The account has a password: the dialog asks for it. */
  hasPassword: boolean;
  /** Without a password, the sign-in must be this recent (seconds left), else 0. */
  recentSignInSecondsLeft: number;
  impersonating: boolean;
};

/** What the deletion dialog needs: blockers, and how the person confirms who they are. */
export async function getDeletionStatus(): Promise<DeletionStatus | null> {
  const { session } = await currentSession();
  if (!session) return null;
  const [blockers, passwords] = await Promise.all([
    accountDeletionBlockers(db, session.user.id),
    db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, session.user.id), eq(account.providerId, "credential"), isNotNull(account.password))),
  ]);
  const elapsed = (Date.now() - new Date(session.session.createdAt).getTime()) / 1000;
  return {
    email: session.user.email,
    blockers,
    hasPassword: passwords.length > 0,
    recentSignInSecondsLeft: Math.max(0, Math.floor(RECENT_SIGN_IN_SECONDS - elapsed)),
    impersonating: Boolean(session.session.impersonatedBy),
  };
}
