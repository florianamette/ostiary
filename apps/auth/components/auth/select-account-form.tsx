"use client";

import { ChevronRightIcon, Loader2, UserPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { addAccountHref, type DeviceAccount } from "@ostiary/core/lib/device-accounts";
import { AuthFormFallback } from "@/components/auth/auth-form-fallback";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useDeviceAccounts } from "@/lib/device-sessions";

/**
 * `prompt=select_account` (e.g. a native app signing in through the system browser): before an
 * app is signed in, the person picks one of the accounts signed in on this browser, or signs in
 * with another one. The OAuth request rides along in the query: the client plugin sends it with
 * each call, so switching accounts or signing in continues it.
 */
export function SelectAccountForm() {
  const t = useTranslations("selectAccount");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const accounts = useDeviceAccounts(session?.user.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loginHref = `/login?${searchParams.toString()}`;
  const user = session?.user;

  // No session to choose from: plain sign-in continues the request.
  useEffect(() => {
    if (!isPending && !user) router.replace(loginHref);
  }, [isPending, user, router, loginHref]);

  // A session from before multi-session was enabled has no device cookie: list it anyway.
  const choices: DeviceAccount[] =
    user && accounts && !accounts.some((a) => a.userId === user.id)
      ? [{ token: "", userId: user.id, name: user.name ?? "", email: user.email }, ...accounts]
      : (accounts ?? []);

  async function choose(account: DeviceAccount) {
    setBusy(account.userId);
    setError(null);
    // The client plugins follow the returned redirect to the app (or the consent page).
    const { error } =
      account.userId === user?.id
        ? await authClient.$fetch("/oauth2/continue", { method: "POST", body: { selected: true } })
        : // Making another account active continues the request with it (the provider's hook).
          await authClient.multiSession.setActive({ sessionToken: account.token });
    if (error) {
      setError(error.message ?? t("error"));
      setBusy(null);
    }
  }

  if (isPending || !user || accounts === null) {
    return <AuthFormFallback height="h-64" />;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{choices.length > 1 ? t("descriptionMany") : t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {choices.map((account) => {
            const label = account.name || account.email;
            return (
              <li key={account.userId}>
                <button
                  type="button"
                  onClick={() => void choose(account)}
                  disabled={busy !== null}
                  aria-label={t("continueAs", { name: label })}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{label}</span>
                    {account.name ? <span className="block truncate text-xs text-muted-foreground">{account.email}</span> : null}
                  </span>
                  {busy === account.userId ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <Button variant="outline" asChild>
          <a href={addAccountHref(locale, searchParams.toString())}>
            <UserPlusIcon className="size-4" aria-hidden />
            {t("useAnother")}
          </a>
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
