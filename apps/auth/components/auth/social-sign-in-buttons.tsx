"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { SocialProviderIcon } from "@ostiary/core/components/brand/social-provider-icon";
import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@ostiary/core/components/ui/tooltip";
import { SOCIAL_PROVIDER_META, type SocialProviderOption } from "@ostiary/core/lib/social-provider-meta";
import { cn } from "@ostiary/core/lib/utils";
import { authClient } from "@/lib/auth-client";

/**
 * A provider's mark. On a highlighted (filled) button it sits on a white tile, as Google's
 * dark-button guidelines show it, so every brand colour stays legible.
 */
export function ProviderIcon({
  provider,
  className,
  onFilled,
}: {
  provider: SocialProviderOption;
  className?: string;
  onFilled?: boolean;
}) {
  const icon = <SocialProviderIcon provider={provider.id} name={provider.name} className={className} />;
  if (!onFilled) return icon;
  return <span className="inline-flex rounded-[4px] bg-white p-0.5 text-black">{icon}</span>;
}

/** Up to this many providers get a full-width "Continue with ..." button each. */
const FULL_WIDTH_MAX = 3;
/** Up to this many, a two-column grid with names; beyond, a grid of logos. */
const NAMED_GRID_MAX = 6;

/**
 * Social sign-in buttons. Few providers get full-width buttons; more get a compact grid (logos
 * only beyond six, each labelled for screen readers and with a tooltip). The last provider used
 * on this device stays a full-width, highlighted button. Failures come back to the login page
 * with an `error` query parameter, which the login form shows.
 */
export function SocialSignInButtons({
  providers,
  callbackURL,
  lastUsedMethod,
  disabled,
}: {
  providers: SocialProviderOption[];
  callbackURL: string;
  lastUsedMethod?: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations("auth.social");
  const locale = useLocale();
  const [pending, setPending] = React.useState<string | null>(null);

  if (providers.length === 0) return null;

  const label = (provider: SocialProviderOption) =>
    SOCIAL_PROVIDER_META[provider.id]?.button === "signIn"
      ? t("signInWith", { provider: provider.name })
      : t("continueWith", { provider: provider.name });

  async function signIn(provider: SocialProviderOption) {
    setPending(provider.id);
    const { error } = await authClient.signIn.social({
      provider: provider.id,
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

  const busy = disabled || pending !== null;
  const lastUsed = providers.find((p) => p.id === lastUsedMethod) ?? null;
  const compact = providers.length > FULL_WIDTH_MAX;
  // In the compact layouts the last-used provider keeps its full-width button, above the grid.
  const full = compact ? (lastUsed ? [lastUsed] : []) : providers;
  const grid = compact ? providers.filter((p) => p !== lastUsed) : [];
  const logosOnly = grid.length > NAMED_GRID_MAX;

  const fullButton = (provider: SocialProviderOption) => {
    const highlighted = provider === lastUsed;
    return (
      <Button
        key={provider.id}
        type="button"
        variant={highlighted ? "default" : "outline"}
        className="w-full"
        disabled={busy}
        onClick={() => void signIn(provider)}
      >
        {pending === provider.id ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ProviderIcon provider={provider} className="size-4" onFilled={highlighted} />
        )}
        <span className="truncate">{label(provider)}</span>
        {highlighted ? (
          <Badge variant="secondary" className="ml-1 text-xs font-normal">
            {t("lastUsed")}
          </Badge>
        ) : null}
      </Button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      {full.map(fullButton)}
      {grid.length ? (
        logosOnly ? (
          <TooltipProvider delayDuration={300}>
            <ul
              aria-label={t("otherProviders")}
              className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2"
            >
              {grid.map((provider) => (
                <li key={provider.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full px-0"
                        disabled={busy}
                        aria-label={label(provider)}
                        onClick={() => void signIn(provider)}
                      >
                        {pending === provider.id ? (
                          <Loader2 className="size-5 animate-spin" aria-hidden />
                        ) : (
                          <ProviderIcon provider={provider} className="size-5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label(provider)}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </TooltipProvider>
        ) : (
          <ul aria-label={t("otherProviders")} className={cn("grid gap-2", "grid-cols-1 min-[360px]:grid-cols-2")}>
            {grid.map((provider) => (
              <li key={provider.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={busy}
                  aria-label={label(provider)}
                  onClick={() => void signIn(provider)}
                >
                  {pending === provider.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ProviderIcon provider={provider} className="size-4" />
                  )}
                  <span className="truncate">{provider.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
