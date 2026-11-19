"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ProviderIcon } from "@/components/auth/social-sign-in-buttons";
import { Button } from "@ostiary/core/components/ui/button";
import { FieldDescription } from "@ostiary/core/components/ui/field";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { useAsyncResource } from "@ostiary/core/hooks/use-async-resource";
import {
  isSocialProvider,
  SOCIAL_PROVIDER_LABELS,
  type SocialProviderOption,
} from "@ostiary/core/lib/social-provider-meta";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { authClient } from "@/lib/auth-client";
import { useAuthErrorMessage } from "@/lib/auth-error-message";
import { useAuthAction } from "@/lib/use-auth-action";
import { needsRecentSignIn, signInAgain } from "@/lib/sign-in-again";

type LinkedAccount = { id: string; accountId: string; providerId: string };

/**
 * Connect or disconnect the sign-in providers turned on in the admin console. Accounts linked to
 * a provider that has since been turned off are listed too, so they can be disconnected.
 */
async function listLinkedAccounts(): Promise<LinkedAccount[]> {
  const res = await authClient.listAccounts();
  if (res.error) throw res.error;
  return Array.isArray(res.data)
    ? res.data.map((a) => ({ id: a.id, accountId: a.accountId, providerId: a.providerId }))
    : [];
}

export function DashboardConnectedAccounts({ providers }: { providers: SocialProviderOption[] }) {
  const t = useTranslations("dashboard.connectedAccounts");
  const locale = useLocale();
  const errorMessage = useAuthErrorMessage();
  const linkedAccounts = useAsyncResource(listLinkedAccounts);
  // A list that cannot be read shows every provider as not connected, rather than loading forever.
  const accounts = linkedAccounts.data ?? (linkedAccounts.error ? [] : null);
  const { pending, run } = useAuthAction<string>();
  const [connecting, setConnecting] = React.useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = React.useState<{ provider: SocialProviderOption; accountId: string } | null>(null);
  const busy = connecting ?? pending;

  function handledError(error: { code?: string }): boolean {
    if (!needsRecentSignIn(error)) return false;
    toast.error(t("signInAgainToChange"), {
      action: { label: t("signInAgain"), onClick: () => void signInAgain(locale) },
    });
    return true;
  }

  async function connect(provider: SocialProviderOption) {
    setConnecting(provider.id);
    try {
      const { error } = await authClient.linkSocial({
        provider: provider.id,
        callbackURL: `/${locale}/dashboard#security`,
        errorCallbackURL: `/${locale}/dashboard#security`,
      });
      if (error) {
        setConnecting(null);
        if (!handledError(error)) toast.error(errorMessage(error, t("error")));
      }
      // On success the browser goes to the provider and comes back connected.
    } catch {
      setConnecting(null);
      toast.error(t("error"));
    }
  }

  async function disconnect() {
    const target = pendingDisconnect;
    if (!target) return;
    await run(target.provider.id, {
      // 1.7 selects the account by its local row id (not the provider's account id).
      call: () => authClient.unlinkAccount({ accountId: target.accountId }),
      success: t("disconnected", { provider: target.provider.name }),
      error: t("error"),
      codes: { FAILED_TO_UNLINK_LAST_ACCOUNT: t("lastMethod") },
      onError: handledError,
      onSuccess: linkedAccounts.reload,
    });
    setPendingDisconnect(null);
  }

  // Enabled providers, then providers turned off since but still linked to this account.
  const rows: SocialProviderOption[] = [
    ...providers,
    ...(accounts ?? [])
      .map((a) => a.providerId)
      .filter((id, i, all) => isSocialProvider(id) && all.indexOf(id) === i && !providers.some((p) => p.id === id))
      .map((id) => ({ id, name: SOCIAL_PROVIDER_LABELS[id as keyof typeof SOCIAL_PROVIDER_LABELS] })),
  ] as SocialProviderOption[];

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
          {rows.map((provider) => {
            const linked = accounts.find((a) => a.providerId === provider.id);
            // Better Auth refuses to remove the only account (password or provider) left.
            const onlyMethod = linked !== undefined && accounts.length === 1;
            return (
              <li key={provider.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-3 text-sm">
                  <ProviderIcon provider={provider} className="size-5" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{provider.name}</span>
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
                    disabled={busy !== null || onlyMethod}
                    title={onlyMethod ? t("lastMethod") : undefined}
                    aria-label={`${t("disconnect")} ${provider.name}`}
                    onClick={() => setPendingDisconnect({ provider, accountId: linked.id })}
                  >
                    {t("disconnect")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={busy === provider.id}
                    disabled={busy !== null}
                    aria-label={`${t("connect")} ${provider.name}`}
                    onClick={() => void connect(provider)}
                  >
                    {t("connect")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDisconnect !== null}
        title={t("confirmTitle", { provider: pendingDisconnect?.provider.name ?? "" })}
        description={t("confirmBody")}
        cancelLabel={t("cancel")}
        confirmLabel={t("disconnect")}
        onCancel={() => setPendingDisconnect(null)}
        onConfirm={disconnect}
      />
    </div>
  );
}
