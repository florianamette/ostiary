function roleTokens(role: string | null | undefined): string[] {
  if (!role?.trim()) return [];
  return role.split(",").map((s) => s.trim()).filter(Boolean);
}

/** True when the user's role string includes any configured admin role (comma-separated allowed). */
export function userHasAdminRole(
  role: string | null | undefined,
  adminRoles: readonly string[],
): boolean {
  const tokens = roleTokens(role);
  const allowed = new Set(adminRoles);
  return tokens.some((t) => allowed.has(t));
}
