import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/*
 * An organization always keeps an owner: Better Auth refuses to remove or demote the last one,
 * and account deletion treats "sole owner" as something to resolve first. The admin console
 * changes memberships past Better Auth, so it applies the same rule with these.
 */

/** Whether a member's role (Better Auth allows several, comma-separated) includes `wanted`. */
export function memberHasRole(role: string | null | undefined, wanted: string): boolean {
  return (role ?? "").split(",").some((token) => token.trim() === wanted);
}

/**
 * Whether changing a member from `currentRole` to `nextRole` (null: removing them) would leave
 * the organization without an owner, given how many other members are owners.
 */
export function leavesNoOwner(currentRole: string, nextRole: string | null, otherOwners: number): boolean {
  if (!memberHasRole(currentRole, "owner")) return false;
  if (nextRole !== null && memberHasRole(nextRole, "owner")) return false;
  return otherOwners === 0;
}

/** SQL condition: the role column includes "owner" (same rule as memberHasRole). */
export function roleIncludesOwner(role: AnyPgColumn): SQL {
  return sql`'owner' = any(string_to_array(replace(${role}, ' ', ''), ','))`;
}
