"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * `prompt=select_account` (e.g. a native app signing in through the system browser): before an
 * app is signed in with the browser's current session, the person confirms it is the account they
 * want, or signs in with another one. The OAuth request rides along in the query, so /login
 * continues it.
 */
export function SelectAccountForm() {
  const t = useTranslations("selectAccount");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState<"continue" | "switch" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loginHref = `/login?${searchParams.toString()}`;
  const user = session?.user;

  // No session to choose from: plain sign-in continues the request.
  useEffect(() => {
    if (!isPending && !user) router.replace(loginHref);
  }, [isPending, user, router, loginHref]);

  async function continueAs() {
    setBusy("continue");
    setError(null);
    // The client plugin follows the returned redirect to the app.
    const { error } = await authClient.$fetch("/oauth2/continue", { method: "POST", body: { selected: true } });
    if (error) {
      setError(error.message ?? t("error"));
      setBusy(null);
    }
  }

  async function useAnother() {
    setBusy("switch");
    await authClient.signOut();
    router.push(loginHref);
  }

  if (isPending || !user) return <div className="h-64 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name || user.email}</p>
            {user.name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
          </div>
        </div>
        <Button onClick={continueAs} disabled={busy !== null}>
          {t("continueAs", { name: user.name || user.email })}
        </Button>
        <Button variant="outline" onClick={useAnother} disabled={busy !== null}>
          {t("useAnother")}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
