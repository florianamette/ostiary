"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { SOCIAL_PROVIDER_LABELS, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";
import { authClient } from "@/lib/auth-client";

/** Provider marks as inline SVG (monochrome, follows the text color). */
export function ProviderIcon({ provider, className }: { provider: SocialProvider; className?: string }) {
  if (provider === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
      </svg>
    );
  }
  return null;
}

/**
 * "Continue with GitHub" (and future providers). Failures come back to the login page with
 * an `error` query parameter, which the login form shows.
 */
export function SocialSignInButtons({
  providers,
  callbackURL,
  lastUsedMethod,
  disabled,
}: {
  providers: SocialProvider[];
  callbackURL: string;
  lastUsedMethod?: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations("auth.social");
  const locale = useLocale();
  const [pending, setPending] = React.useState<SocialProvider | null>(null);

  if (providers.length === 0) return null;

  async function signIn(provider: SocialProvider) {
    setPending(provider);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      newUserCallbackURL: `/${locale}/dashboard`,
      errorCallbackURL: `/${locale}/login`,
    });
    if (error) {
      setPending(null);
      toast.error(error.message ?? t("error"));
    }
    // On success the browser is already on its way to the provider.
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant={lastUsedMethod === provider ? "default" : "outline"}
          className="w-full"
          disabled={disabled || pending !== null}
          onClick={() => void signIn(provider)}
        >
          {pending === provider ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ProviderIcon provider={provider} className="size-4" />
          )}
          {t("continueWith", { provider: SOCIAL_PROVIDER_LABELS[provider] })}
          {lastUsedMethod === provider ? (
            <Badge variant="secondary" className="ml-2 text-xs font-normal">
              {t("lastUsed")}
            </Badge>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
