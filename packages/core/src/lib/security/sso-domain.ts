/*
 * The email domain an SSO provider claims. The admin console, the DNS verification record and
 * Better Auth's SSO plugin (which reads the stored value with tldts) must all agree on what it
 * names, so only a plain hostname is accepted: lowercase letters, digits and hyphens in dot-
 * separated labels, and nothing a URL parser could read as userinfo, port, path or a list.
 * "attacker.com\@victim.com", for instance, is attacker.com to WHATWG URL but victim.com to
 * tldts. One domain per provider: that is what the console verifies with a TXT record.
 */

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TOP_LEVEL = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** The canonical domain (trimmed, lowercased), or null when the value is not a plain hostname. */
export function parseSsoDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const domain = raw.trim().toLowerCase();
  if (!domain || domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => LABEL.test(label))) return null;
  if (!TOP_LEVEL.test(labels[labels.length - 1]!)) return null;
  return domain;
}

/** True when a stored provider domain is exactly a canonical hostname (checked at sign-in). */
export function isStrictSsoDomain(stored: string | null | undefined): boolean {
  return typeof stored === "string" && parseSsoDomain(stored) === stored;
}

/**
 * Prefix of the DNS TXT record that proves a provider's domain (`_<prefix>-<providerId>`), and
 * of Better Auth's verification row for it. Changing it invalidates records already published.
 */
export const SSO_DOMAIN_TOKEN_PREFIX = "ostiary";

/** The verification row (and TXT record name) of an SSO provider's domain. */
export function ssoDomainVerificationIdentifier(providerId: string): string {
  return `_${SSO_DOMAIN_TOKEN_PREFIX}-${providerId}`;
}
