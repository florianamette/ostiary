import { eq, inArray } from "drizzle-orm";

import { member, organization, scimSubject, scimUser, user } from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";

/**
 * Why an account cannot delete itself. Each blocker has a way out that the dashboard explains:
 *
 * - `admin`: platform admins are demoted by another admin first. This keeps at least one admin
 *   (an admin can never remove the last one, themselves included), and makes the loss of admin
 *   rights a decision someone else sees and records in the audit log.
 * - `sole_owner`: the account is the only owner of an organization. Another member is made
 *   owner first (or an admin deletes the organization), so no organization is left without
 *   anyone who can manage it.
 * - `scim`: the account is provisioned by a company directory (SCIM). The directory would
 *   create it again on its next sync, so the directory's admin removes it there; the
 *   deprovisioning then deactivates it here.
 */
export type DeletionBlocker =
  | { kind: "admin" }
  | { kind: "sole_owner"; organizations: { id: string; name: string }[] }
  | { kind: "scim"; organizations: { id: string; name: string }[] };

const OWNER_ROLE = "owner";

function roles(role: string | null | undefined): string[] {
  return (role ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

/** True when an organization role string includes `owner` (roles can be comma-separated). */
function isOwnerRole(role: string | null | undefined): boolean {
  return roles(role).includes(OWNER_ROLE);
}

/** Everything that stops this account from deleting itself; empty when it may. */
export async function accountDeletionBlockers(db: Database, userId: string): Promise<DeletionBlocker[]> {
  const [[row], memberships, scimRows, subjects] = await Promise.all([
    db.select({ role: user.role }).from(user).where(eq(user.id, userId)),
    db
      .select({ organizationId: member.organizationId, role: member.role, name: organization.name })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId)),
    db.select({ organizationId: scimUser.provisioningDomainId }).from(scimUser).where(eq(scimUser.userId, userId)),
    db.select({ id: scimSubject.id }).from(scimSubject).where(eq(scimSubject.userId, userId)),
  ]);
  if (!row) return [];

  const blockers: DeletionBlocker[] = [];
  if (userHasAdminRole(row.role, ["admin"])) blockers.push({ kind: "admin" });

  const owned = memberships.filter((m) => isOwnerRole(m.role));
  if (owned.length) {
    const others = await db
      .select({ organizationId: member.organizationId, userId: member.userId, role: member.role })
      .from(member)
      .where(inArray(member.organizationId, owned.map((m) => m.organizationId)));
    const alone = owned.filter(
      (m) => !others.some((o) => o.organizationId === m.organizationId && o.userId !== userId && isOwnerRole(o.role)),
    );
    if (alone.length) {
      blockers.push({ kind: "sole_owner", organizations: alone.map((m) => ({ id: m.organizationId, name: m.name })) });
    }
  }

  if (scimRows.length || subjects.length) {
    const ids = [...new Set(scimRows.map((r) => r.organizationId))];
    const orgs = ids.length
      ? await db.select({ id: organization.id, name: organization.name }).from(organization).where(inArray(organization.id, ids))
      : [];
    blockers.push({ kind: "scim", organizations: orgs });
  }
  return blockers;
}

/** Stable error code sent to the browser when a deletion is refused for one of the blockers. */
export const ACCOUNT_DELETION_BLOCKED = "ACCOUNT_DELETION_BLOCKED";
