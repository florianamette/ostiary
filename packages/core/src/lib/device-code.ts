/**
 * User codes for device sign-in (RFC 8628). Better Auth generates 8 characters from an alphabet
 * without look-alikes (no 0/O, 1/I) and matches them case-insensitively, ignoring separators.
 * People see them as ABCD-EFGH.
 */
export const USER_CODE_LENGTH = 8;

/** What the user typed or pasted, as Better Auth stores it: letters and digits, upper case. */
export function normalizeUserCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, USER_CODE_LENGTH);
}

/** ABCDEFGH → ABCD-EFGH; shorter input (while typing) gets the dash once it passes 4. */
export function formatUserCode(code: string): string {
  const half = USER_CODE_LENGTH / 2;
  return code.length > half ? `${code.slice(0, half)}-${code.slice(half)}` : code;
}
