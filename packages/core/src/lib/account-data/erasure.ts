import { and, eq, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import {
  auditLog,
  authEvent,
  invitation,
  member,
  oauthClient,
  session,
  ssoProvider,
  verification,
  webhookDelivery,
} from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { registrationSource } from "@ostiary/core/lib/client-registration-policy";

/*
 * Erasure (GDPR article 17), run just before an account row is deleted, whoever deletes it
 * (the user, an admin). Foreign keys then remove what belongs to the account alone: sessions,
 * sign-in methods, passkeys, two-factor secrets, personal API keys, OAuth tokens and consents,
 * memberships, invitations it sent, device codes, SCIM records, and apps it registered itself.
 * This covers what the foreign keys cannot:
 *
 * - Audit log: entries are kept (who changed what stays answerable for the instance, GDPR
 *   article 17(3)(b) and (e)) but no longer name the person. The actor's email, the target's
 *   label and the person's IP addresses are replaced, and their email, username and name are
 *   removed from the details. The account id stays as the pseudonymous key that ties the
 *   entries together; nothing resolves it to a person any more.
 * - Sign-in events: kept for the activity charts, without IP address or identifier.
 * - Pending verifications (sign-in codes, email change, trusted devices, the deletion link).
 * - Invitations sent to the address, and sessions the person opened as an administrator
 *   impersonating someone.
 * - Organization API keys the person created belong to the organization and keep working; the
 *   foreign key only clears their creator (`apikey.created_by`).
 * - Apps and SSO providers an administrator registered from the console belong to the
 *   instance, not the person: they are detached (owner cleared) instead of deleted with them.
 * - Webhook deliveries already sent: their payloads carry the person's profile and are kept 30
 *   days for the delivery log, so their data is redacted. Pending ones (including the
 *   `user.deleted` event itself) still go out, and age out with the log.
 */

/** Replaces names and addresses in kept records. */
export const DELETED_USER_LABEL = "[deleted user]";

export type ErasedUser = { id: string; email: string; name?: string | null; username?: string | null };

export type ErasureSummary = {
  /** The memberships the account had, for `organization.member.removed` webhooks. */
  memberships: { id: string; organizationId: string; userId: string; role: string }[];
  auditEntries: number;
  signInEvents: number;
  verifications: number;
  invitations: number;
  impersonationSessions: number;
  detachedClients: number;
  detachedSsoProviders: number;
  redactedDeliveries: number;
};

/** `value` without any of `needles` (case-insensitive), recursively. Unchanged values keep their identity. */
export function scrubValue(value: unknown, needles: string[]): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const needle of needles) {
      if (!needle) continue;
      const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(pattern, DELETED_USER_LABEL);
    }
    return out === value ? value : out;
  }
  if (Array.isArray(value)) {
    const next = value.map((item) => scrubValue(item, needles));
    return next.some((item, i) => item !== value[i]) ? next : value;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const next = entries.map(([k, v]) => [k, scrubValue(v, needles)] as const);
    return next.some(([, v], i) => v !== entries[i]![1]) ? Object.fromEntries(next) : value;
  }
  return value;
}

/** What identifies the person in free text: email, username, and a name long enough to be specific. */
export function personalNeedles(u: ErasedUser): string[] {
  const needles = [u.email, u.username ?? ""];
  const name = u.name?.trim() ?? "";
  // A one- or two-letter name would erase unrelated text.
  if (name.length >= 3) needles.push(name);
  return [...new Set(needles.filter(Boolean))].sort((a, b) => b.length - a.length);
}

function contains(column: PgColumn | SQL, needle: string) {
  return sql`position(${needle.toLowerCase()} in lower(${column}::text)) > 0`;
}

/** Erases what the account's foreign keys do not, in one transaction. See the comment above. */
export async function prepareUserErasure(db: Database, u: ErasedUser): Promise<ErasureSummary> {
  const needles = personalNeedles(u);
  const email = u.email.toLowerCase();
  const identifiers = [email, ...(u.username ? [u.username.toLowerCase()] : [])];

  return db.transaction(async (tx) => {
    const memberships = await tx
      .select({ id: member.id, organizationId: member.organizationId, userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.userId, u.id));

    // Audit log: entries stay, the person's identifiers go.
    const audits = await tx
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actorEmail: auditLog.actorEmail,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        targetLabel: auditLog.targetLabel,
        metadata: auditLog.metadata,
        ipAddress: auditLog.ipAddress,
      })
      .from(auditLog)
      .where(
        or(
          eq(auditLog.actorId, u.id),
          and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, u.id)),
          sql`lower(${auditLog.actorEmail}) = ${email}`,
          ...needles.map((needle) => contains(auditLog.targetLabel, needle)),
          ...needles.map((needle) => contains(auditLog.metadata, needle)),
        ),
      );
    let auditEntries = 0;
    for (const row of audits) {
      const isActor = row.actorId === u.id || row.actorEmail?.toLowerCase() === email;
      const isTarget = row.targetType === "user" && row.targetId === u.id;
      const next = {
        actorEmail: isActor ? DELETED_USER_LABEL : row.actorEmail,
        // The IP of an entry the person made is theirs; an admin's IP on an entry about them is not.
        ipAddress: isActor ? null : row.ipAddress,
        targetLabel: isTarget ? DELETED_USER_LABEL : (scrubValue(row.targetLabel, needles) as string | null),
        metadata: scrubValue(row.metadata, needles),
      };
      if (
        next.actorEmail === row.actorEmail &&
        next.ipAddress === row.ipAddress &&
        next.targetLabel === row.targetLabel &&
        next.metadata === row.metadata
      ) {
        continue;
      }
      await tx.update(auditLog).set(next).where(eq(auditLog.id, row.id));
      auditEntries++;
    }

    // Sign-in events: counts stay for the charts; the address and the identifier typed go.
    const signedIn = await tx
      .update(authEvent)
      .set({ ipAddress: null, identifier: null })
      .where(eq(authEvent.userId, u.id))
      .returning({ id: authEvent.id });
    const failed = await tx
      .update(authEvent)
      .set({ ipAddress: null, identifier: null })
      .where(and(isNotNull(authEvent.identifier), inArray(sql<string>`lower(${authEvent.identifier})`, identifiers)))
      .returning({ id: authEvent.id });

    // Codes, links and trusted devices: stored by account id (value) or address (identifier).
    const verifications = await tx
      .delete(verification)
      .where(or(eq(verification.value, u.id), contains(verification.identifier, email)))
      .returning({ id: verification.id });

    const invitations = await tx
      .delete(invitation)
      .where(sql`lower(${invitation.email}) = ${email}`)
      .returning({ id: invitation.id });

    // Sessions this person opened in someone else's account while impersonating them.
    const impersonations = await tx
      .delete(session)
      .where(and(eq(session.impersonatedBy, u.id), ne(session.userId, u.id)))
      .returning({ id: session.id });

    // Console-registered apps are the instance's: keep them (and every user's tokens for them).
    const owned = await tx
      .select({ id: oauthClient.id, clientDiscoveryId: oauthClient.clientDiscoveryId, metadata: oauthClient.metadata })
      .from(oauthClient)
      .where(eq(oauthClient.userId, u.id));
    const instanceClients = owned.filter((c) => registrationSource(c) === "admin").map((c) => c.id);
    if (instanceClients.length) {
      await tx.update(oauthClient).set({ userId: null }).where(inArray(oauthClient.id, instanceClients));
    }
    const sso = await tx
      .update(ssoProvider)
      .set({ userId: null })
      .where(eq(ssoProvider.userId, u.id))
      .returning({ id: ssoProvider.id });

    // Delivered (or given up) webhook payloads mentioning the account.
    const deliveries = await tx
      .select({ id: webhookDelivery.id, payload: webhookDelivery.payload })
      .from(webhookDelivery)
      .where(and(ne(webhookDelivery.status, "pending"), contains(webhookDelivery.payload, u.id)));
    for (const delivery of deliveries) {
      await tx.update(webhookDelivery).set({ payload: redactPayload(delivery.payload) }).where(eq(webhookDelivery.id, delivery.id));
    }

    return {
      memberships,
      auditEntries,
      signInEvents: signedIn.length + failed.length,
      verifications: verifications.length,
      invitations: invitations.length,
      impersonationSessions: impersonations.length,
      detachedClients: instanceClients.length,
      detachedSsoProviders: sso.length,
      redactedDeliveries: deliveries.length,
    };
  });
}

/** Keeps a delivered event's envelope (id, type, time) and drops its data. */
export function redactPayload(payload: string): string {
  try {
    const event = JSON.parse(payload) as Record<string, unknown>;
    return JSON.stringify({ id: event.id, type: event.type, timestamp: event.timestamp, data: { redacted: true } });
  } catch {
    return JSON.stringify({ data: { redacted: true } });
  }
}
