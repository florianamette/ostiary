/** Two-letter initials for avatar fallbacks. */
export function userInitials(name: string): string {
  const s = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return s || "?";
}
