import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

/*
 * Organization roles and their permissions (Better Auth's organization plugin). Owner, admin and
 * member are Better Auth's, unchanged, plus the API key plugin's `apiKey` resource: owners and
 * admins manage the organization's keys, members do not. Organizations may add their own roles
 * (`dynamicAccessControl`, table organization_role) with any of these permissions.
 */

export const API_KEY_ACTIONS = ["create", "read", "update", "delete"] as const;

/** Every permission a role can have: resource -> actions. */
export const ORGANIZATION_STATEMENTS = {
  ...defaultStatements,
  apiKey: API_KEY_ACTIONS,
} as const;
export type OrganizationResource = keyof typeof ORGANIZATION_STATEMENTS;

export const organizationAc = createAccessControl(ORGANIZATION_STATEMENTS);

export const organizationRoles = {
  owner: organizationAc.newRole({ ...ownerAc.statements, apiKey: API_KEY_ACTIONS }),
  admin: organizationAc.newRole({ ...adminAc.statements, apiKey: API_KEY_ACTIONS }),
  member: organizationAc.newRole({ ...memberAc.statements }),
};

export const BUILT_IN_ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;

/** A custom role's name: what `member.role` holds and tokens carry, so short and plain. */
export const CUSTOM_ROLE_NAME = /^[a-z][a-z0-9_-]{1,31}$/;

export type RolePermissions = Partial<Record<OrganizationResource, string[]>>;

/** The permissions of a built-in role. */
export function builtInRolePermissions(role: (typeof BUILT_IN_ORGANIZATION_ROLES)[number]): RolePermissions {
  return Object.fromEntries(
    Object.entries(organizationRoles[role].statements).map(([resource, actions]) => [resource, [...(actions as readonly string[])]]),
  );
}

/**
 * Checks and normalizes permissions sent for a custom role: known resources and actions only,
 * each listed once, in the statements' order. Null when something is unknown.
 */
export function normalizeRolePermissions(raw: unknown): RolePermissions | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sent = raw as Record<string, unknown>;
  const resources = Object.keys(ORGANIZATION_STATEMENTS) as OrganizationResource[];
  // Own keys only, so "__proto__" or "constructor" is refused like any unknown resource.
  if (Object.keys(sent).some((key) => !(resources as string[]).includes(key))) return null;
  const out: RolePermissions = {};
  for (const resource of resources) {
    if (!Object.hasOwn(sent, resource)) continue;
    const actions = sent[resource];
    const allowed = ORGANIZATION_STATEMENTS[resource] as readonly string[];
    if (!Array.isArray(actions) || !actions.every((a) => typeof a === "string" && allowed.includes(a))) return null;
    const picked = allowed.filter((action) => actions.includes(action));
    if (picked.length) out[resource] = picked;
  }
  return out;
}

/** A custom role's stored permissions (organization_role.permission, JSON). */
export function parseRolePermissions(stored: string): RolePermissions {
  try {
    return normalizeRolePermissions(JSON.parse(stored)) ?? {};
  } catch {
    return {};
  }
}
