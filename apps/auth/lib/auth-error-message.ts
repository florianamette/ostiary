"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message";

/** Error shape returned by the Better Auth client (`{ error }` or `ctx.error`). */
export type AuthClientError =
  | { code?: string; message?: string; status?: number; retryAfter?: unknown }
  | null
  | undefined;

/**
 * The ban message of an account deactivated by SCIM provisioning (SCIM_DEACTIVATED_MESSAGE in
 * @ostiary/core/lib/scim, a server module this client file cannot import).
 */
const SCIM_DEACTIVATED_MESSAGE = "Your organization has deactivated this account.";

/** Translated messages, keyed by Better Auth (or Ostiary) error code. */
export type ErrorCodeMessages = Partial<Record<string, string>>;

/** The `authErrors` key for an error code every screen words the same way. */
const COMMON_CODES: Record<string, string> = {
  BANNED_USER: "banned",
  INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
  INVALID_USERNAME_OR_PASSWORD: "invalidCredentials",
  USER_ALREADY_EXISTS: "userExists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "userExists",
  USERNAME_IS_ALREADY_TAKEN: "usernameTaken",
  USERNAME_TOO_SHORT: "usernameInvalid",
  USERNAME_TOO_LONG: "usernameInvalid",
  INVALID_USERNAME: "usernameInvalid",
  PASSWORD_TOO_SHORT: "passwordTooShort",
  PASSWORD_TOO_LONG: "passwordTooLong",
  PASSWORD_COMPROMISED: "passwordCompromised",
  INVALID_PASSWORD: "invalidPassword",
  RECENT_SIGN_IN_REQUIRED: "recentSignIn",
  SESSION_NOT_FRESH: "recentSignIn",
  SESSION_EXPIRED: "sessionExpired",
  IMPERSONATING: "impersonating",
  EMAIL_NOT_VERIFIED: "emailNotVerified",
  INVALID_TOKEN: "invalidToken",
  PUBLIC_ORGANIZATION_RESTRICTED: "publicOrganization",
};

type Translate = (key: string) => string;

/**
 * The message to show for a failed Better Auth call, in the user's language. In order: the
 * screen's own wording for the code (`codes`), the rate limiter's "try again in…", the
 * shared wording for common codes, then the screen's `fallback`. The server's own text is
 * English and never shown: an unknown error gets the fallback.
 */
export function authErrorMessage(
  error: AuthClientError,
  fallback: string,
  codes: ErrorCodeMessages,
  translate: { common: Translate; limit: Parameters<typeof rateLimitMessage>[1] },
): string {
  const code = error?.code;
  if (code && codes[code]) return codes[code];
  const limited = rateLimitMessage(error, translate.limit);
  if (limited) return limited;
  if (code === "BANNED_USER" && error?.message === SCIM_DEACTIVATED_MESSAGE) {
    return translate.common("deactivated");
  }
  const common = code ? COMMON_CODES[code] : undefined;
  return common ? translate.common(common) : fallback;
}

/**
 * `authErrorMessage` bound to the current locale:
 * `const errorMessage = useAuthErrorMessage(); toast.error(errorMessage(error, t("failed")))`.
 */
export function useAuthErrorMessage(): (
  error: AuthClientError,
  fallback: string,
  codes?: ErrorCodeMessages,
) => string {
  const tCommon = useTranslations("authErrors");
  const tLimit = useTranslations("rateLimit");
  return useCallback(
    (error, fallback, codes = {}) =>
      authErrorMessage(error, fallback, codes, { common: (key) => tCommon(key as never), limit: tLimit }),
    [tCommon, tLimit],
  );
}
