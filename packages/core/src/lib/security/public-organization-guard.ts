import { PUBLIC_ORGANIZATION_ID, PUBLIC_ORGANIZATION_SLUG } from "@ostiary/core/lib/organization-public";

/*
 * Every account is a member of the Public organization (the B2C workspace). Membership there
 * says nothing about the other members, so its member list, invitations, teams and member
 * changes are for platform admins only. Without a target in the request, Better Auth uses the
 * session's active organization, which is Public unless the person picked another.
 */

/** Organization endpoints that read or change other people's membership. */
const RESTRICTED_PATHS = new Set([
  "/organization/list-members",
  "/organization/get-full-organization",
  "/organization/list-invitations",
  "/organization/invite-member",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/update",
  "/organization/delete",
  "/organization/list-teams",
  "/organization/list-team-members",
  "/organization/create-team",
  "/organization/update-team",
  "/organization/remove-team",
  "/organization/add-team-member",
  "/organization/remove-team-member",
  "/organization/list-roles",
  "/organization/get-role",
  "/organization/create-role",
  "/organization/update-role",
  "/organization/delete-role",
]);

type Input = Record<string, unknown>;

function targetsPublic(input: Input, activeOrganizationId: string | null | undefined): boolean {
  if (typeof input.organizationId === "string" && input.organizationId) return input.organizationId === PUBLIC_ORGANIZATION_ID;
  if (typeof input.organizationSlug === "string" && input.organizationSlug) return input.organizationSlug === PUBLIC_ORGANIZATION_SLUG;
  return activeOrganizationId === PUBLIC_ORGANIZATION_ID;
}

/**
 * Whether to refuse this organization request. `input` is the request's body and query merged.
 */
export function publicOrganizationRequestRefused(
  path: string,
  input: Input,
  caller: { isPlatformAdmin: boolean; activeOrganizationId?: string | null },
): boolean {
  if (caller.isPlatformAdmin) return false;
  // Someone else's role in the organization (one's own is fine).
  const otherMemberRole = path === "/organization/get-active-member-role" && typeof input.userId === "string" && Boolean(input.userId);
  if (!RESTRICTED_PATHS.has(path) && !otherMemberRole) return false;
  return targetsPublic(input, caller.activeOrganizationId);
}
