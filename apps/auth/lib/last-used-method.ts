"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta";
import { authClient } from "@/lib/auth-client";

/** The hint for a built-in sign-in method; null for other methods. */
function lastUsedHintKey(method: string) {
  switch (method) {
    case "email":
      return "lastUsedHintEmail";
    case "username":
      return "lastUsedHintUsername";
    case "passkey":
      return "lastUsedHintPasskey";
    case "email-otp":
      return "lastUsedHintEmailCode";
    default:
      return null;
  }
}

/** The cookie does not change while the login page is open. */
function subscribeNever() {
  return () => {};
}

function readLastUsedMethod(): string | null {
  return authClient.getLastUsedLoginMethod() ?? null;
}

function decodeMethod(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The sign-in method this browser used last (Better Auth's last-login-method cookie) and the
 * hint that names it: a built-in method in words, a social provider by its name. A method the
 * login page has no wording for gets no hint, rather than its id turned into English words.
 */
export function useLastUsedMethod(socialProviders: SocialProviderOption[]): {
  lastUsedMethod: string | null;
  lastUsedHint: string | null;
} {
  const t = useTranslations("auth.login");
  // A cookie: read in the browser only (none on the server render, so no hydration mismatch).
  const raw = useSyncExternalStore(subscribeNever, readLastUsedMethod, () => null);
  const lastUsedMethod = raw ? decodeMethod(raw) : null;

  if (!lastUsedMethod) return { lastUsedMethod, lastUsedHint: null };
  const key = lastUsedHintKey(lastUsedMethod);
  if (key) return { lastUsedMethod, lastUsedHint: t(key) };
  const provider = socialProviders.find((p) => p.id === lastUsedMethod);
  return {
    lastUsedMethod,
    lastUsedHint: provider ? t("lastUsedHintOther", { method: provider.name }) : null,
  };
}
