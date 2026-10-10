"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { brand } from "@ostiary/core/lib/brand";
import { createOneTapAuthClient } from "@ostiary/core/lib/auth-client-factory";
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message";
import type { GoogleOneTapConfig } from "@ostiary/core/lib/social-provider-meta";
import { authClient, clientBaseURL } from "@/lib/auth-client";

/** Sign-in methods remembered on this device (lastLoginMethod plugin) other than Google. */
function lastUsedAnotherMethod(): boolean {
  const raw = authClient.getLastUsedLoginMethod();
  if (!raw) return false;
  let method = raw;
  try {
    method = decodeURIComponent(raw);
  } catch {}
  return method !== "google";
}

/**
 * Google One Tap: Google's prompt (FedCM in Chrome) offering the Google accounts signed in to
 * this browser. Renders nothing itself. A choice signs in like "Continue with Google", then goes
 * to `callbackURL`, or resumes the app's authorization when the page has one. Not shown when
 * this device last signed in another way, and silently absent when the person dismisses it,
 * the browser cannot show it, or the script cannot load.
 */
export function GoogleOneTap({
  config,
  callbackURL,
  context,
}: {
  config: GoogleOneTapConfig | null;
  callbackURL: string;
  context: "signin" | "signup";
}) {
  const t = useTranslations("auth.social");
  const tLimit = useTranslations("rateLimit");
  const locale = useLocale();
  const started = React.useRef(false);
  const clientId = config?.clientId;

  React.useEffect(() => {
    if (!clientId || started.current) return;
    started.current = true;
    if (lastUsedAnotherMethod()) return;
    const client = createOneTapAuthClient(clientBaseURL(), clientId);
    client
      .oneTap({
        context,
        // The person picks the account: never signed in without a click (mid-authorization too).
        autoSelect: false,
        // With fetchOptions, the plugin leaves navigation to us.
        fetchOptions: {
          onSuccess: ({ data }) => {
            // An account with two-factor authentication: the code step, like after a password.
            // Same query string (callbackURL and any signed app request), plus where to go next.
            if (data && typeof data === "object" && "twoFactorRedirect" in data && data.twoFactorRedirect) {
              const params = new URLSearchParams(window.location.search);
              if (!params.has("callbackURL")) params.set("callbackURL", callbackURL);
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: the sign-in set a two-factor cookie
              window.location.assign(`/${locale}/two-factor?${params.toString()}`);
              return;
            }
            // Resuming an app's authorization: Better Auth's redirect plugin is already on it.
            const resumed = data && typeof data === "object" && "redirect" in data && "url" in data;
            if (!resumed) window.location.assign(callbackURL);
          },
          onError: ({ error }) => {
            const limited = rateLimitMessage(error, tLimit);
            const message = error.message ?? "";
            toast.error(
              limited ??
                (message === "account not linked" || (error as { code?: string }).code === "account_not_linked"
                  ? t("notLinked", { name: brand.name })
                  : message === "signup disabled"
                    ? t("signUpDisabled")
                    : t("error")),
            );
          },
        },
      })
      .catch(() => {
        // Script blocked or unreachable: the other sign-in methods are on the page.
      });
  }, [clientId, callbackURL, context, locale, t, tLimit]);

  return null;
}
