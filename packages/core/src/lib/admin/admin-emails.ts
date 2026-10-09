import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";

/*
 * ADMIN_EMAILS (first-run setup): these addresses get the platform admin role, but only once
 * their owner has proven the inbox. A password sign-up is promoted when its verification link
 * (or an emailed sign-in code) is used. A social sign-up is promoted at creation only when the
 * provider reports the address as verified. SSO and SCIM never promote: an identity provider
 * vouches for its own domain's addresses, not for this deployment's operator.
 */

/** The addresses in ADMIN_EMAILS, lowercased. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Paths whose user creation comes from an identity provider that must never mint an admin. */
function fromIdentityProvider(path: string | undefined): boolean {
  return Boolean(path && (path.startsWith("/sso/") || path.startsWith("/scim/")));
}

/** Whether a new account gets the admin role when it is created. */
export function adminOnSignUp(
  user: { email: string; emailVerified?: boolean | null },
  path: string | undefined,
  adminEmails: ReadonlySet<string>,
): boolean {
  if (!adminEmails.has(user.email.toLowerCase())) return false;
  if (fromIdentityProvider(path)) return false;
  // Strictly `true`: a provider sending the string "false" has not verified anything.
  return user.emailVerified === true;
}

/** Endpoints that set emailVerified because the person proved the inbox (link or code). */
const INBOX_PROOF_PATHS = new Set(["/verify-email", "/sign-in/email-otp"]);

/** Whether an account that just proved its address gets the admin role (password sign-ups). */
export function adminOnVerification(
  user: { email: string; emailVerified?: boolean | null; role?: string | null },
  path: string | undefined,
  adminEmails: ReadonlySet<string>,
): boolean {
  if (!path || !INBOX_PROOF_PATHS.has(path)) return false;
  if (user.emailVerified !== true) return false;
  if (!adminEmails.has(user.email.toLowerCase())) return false;
  return !userHasAdminRole(user.role, ["admin"]);
}
