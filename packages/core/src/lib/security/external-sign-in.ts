/*
 * Sign-ins that start a session without the password step: social providers (redirect, ID
 * token, Google One Tap), enterprise SSO (OIDC and SAML) and the email verification link that
 * signs in. For an account with two-factor authentication these stop at the same second step
 * as a password, see auth-hooks/sign-in-plugins.ts (externalSignInTwoFactor). Passkeys are
 * already two factors; password and sign-in code endpoints are handled by the two-factor
 * plugin itself.
 */

import { resolveSafeRedirect } from "@ostiary/core/lib/safe-redirect";

const EXACT = new Set(["/sign-in/social", "/one-tap/callback", "/sso/callback", "/verify-email"]);
const PREFIXES = ["/callback/", "/oauth2/callback/", "/sso/callback/", "/sso/saml2/sp/acs/", "/sso/saml2/callback/"];

export function isExternalSignInPath(path: string | undefined): boolean {
  if (!path) return false;
  return EXACT.has(path) || PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Removes `login` from a space-separated prompt: the person has just signed in. */
function withoutLoginPrompt(query: string): string {
  const params = new URLSearchParams(query);
  const prompt = params.get("prompt");
  if (prompt !== null) {
    const rest = prompt.split(" ").filter((value) => value && value !== "login");
    if (rest.length) params.set("prompt", rest.join(" "));
    else params.delete("prompt");
  }
  return params.toString();
}

/** A same-origin path (with query) for `location`, or null for anything else. */
function samePath(location: string | null | undefined, baseURL: string): string | null {
  // The shared callbackURL check: no backslashes or control characters, same origin only.
  const target = resolveSafeRedirect(location, { origin: baseURL });
  return target ? `${target.pathname}${target.search}` : null;
}

/**
 * The auth app's two-factor page, continuing afterwards to where the sign-in was going: the
 * app's authorization request when one is pending (`oauthQuery`, unsigned: the authorize
 * endpoint checks it again), else the sign-in's own destination when it is on this origin.
 */
export function twoFactorStepURL(
  baseURL: string,
  next: { location?: string | null; oauthQuery?: string | null },
): string {
  const page = `${baseURL.replace(/\/+$/, "")}/two-factor`;
  const callbackURL = next.oauthQuery
    ? `/api/auth/oauth2/authorize?${withoutLoginPrompt(next.oauthQuery)}`
    : samePath(next.location, baseURL);
  return callbackURL ? `${page}?callbackURL=${encodeURIComponent(callbackURL)}` : page;
}
