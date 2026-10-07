"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ProviderIcon } from "@/components/auth/social-sign-in-buttons";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { FieldDescription } from "@ostiary/core/components/ui/field";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { SOCIAL_PROVIDER_LABELS, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";
import { authClient } from "@/lib/auth-client";
import { needsRecentSignIn, signInAgain } from "@/lib/sign-in-again";

type LinkedAccount = { id: string; accountId: string; providerId: string };

/** Connect or disconnect GitHub and other sign-in providers. */
export function DashboardConnectedAccounts({ providers }: { providers: SocialProvider[] }) {
  const t = useTranslations("dashboard.connectedAccounts");
  const locale = useLocale();
  const [accounts, setAccounts] = React.useState<LinkedAccount[] | null>(null);
  const [busy, setBusy] = React.useState<SocialProvider | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = React.useState<{ provider: SocialProvider; accountId: string } | null>(null);

  const load = React.useCallback(async () => {
    const res = await authClient.listAccounts();
    setAccounts(
      Array.isArray(res.data)
        ? res.data.map((a) => ({ id: a.id, accountId: a.accountId, providerId: a.providerId }))
        : [],
    );
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function reportError(error: { message?: string; code?: string }) {
    if (needsRecentSignIn(error)) {
      toast.error(t("signInAgainToChange"), {
        action: { label: t("signInAgain"), onClick: () => void signInAgain(locale) },
      });
      return;
    }
    if (error.code === "FAILED_TO_UNLINK_LAST_ACCOUNT") {
      toast.error(t("lastMethod"));
      return;
    }
    toast.error(error.message ?? t("error"));
  }

  async function connect(provider: SocialProvider) {
    setBusy(provider);
    const { error } = await authClient.linkSocial({
      provider,
      callbackURL: `/${locale}/dashboard#security`,
      errorCallbackURL: `/${locale}/dashboard#security`,
    });
    if (error) {
      setBusy(null);
      reportError(error);
    }
    // On success the browser goes to the provider and comes back connected.
  }

  async function disconnect() {
    if (!pendingDisconnect) return;
    setBusy(pendingDisconnect.provider);
    try {
      // 1.7 selects the account by its local row id (not the provider's account id).
      const { error } = await authClient.unlinkAccount({ accountId: pendingDisconnect.accountId });
      if (error) {
        reportError(error);
        return;
      }
      toast.success(t("disconnected", { provider: SOCIAL_PROVIDER_LABELS[pendingDisconnect.provider] }));
      setPendingDisconnect(null);
      void load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{t("title")}</h3>
        <FieldDescription>{t("hint")}</FieldDescription>
      </div>
      {accounts === null ? (
        <Skeleton className="h-14 w-full" />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {providers.map((provider) => {
            const linked = accounts.find((a) => a.providerId === provider);
            const label = SOCIAL_PROVIDER_LABELS[provider];
            return (
              <li key={provider} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="flex items-center gap-3 text-sm">
                  <ProviderIcon provider={provider} className="size-5" />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {linked ? t("connected") : t("notConnected")}
                    </span>
                  </span>
                </span>
                {linked ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => setPendingDisconnect({ provider, accountId: linked.id })}
                  >
                    {t("disconnect")}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void connect(provider)}>
                    {busy === provider ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    {t("connect")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={pendingDisconnect !== null} onOpenChange={(open) => !open && busy === null && setPendingDisconnect(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("confirmTitle", { provider: pendingDisconnect ? SOCIAL_PROVIDER_LABELS[pendingDisconnect.provider] : "" })}
            </DialogTitle>
            <DialogDescription>{t("confirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setPendingDisconnect(null)}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void disconnect()}>
              {busy !== null ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
