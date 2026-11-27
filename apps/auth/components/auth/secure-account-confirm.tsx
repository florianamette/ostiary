"use client";

import * as React from "react";
import { MailCheckIcon, ShieldAlertIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Link } from "@/i18n/navigation";
import { secureMyAccount } from "@/lib/secure-account-actions";

/** "This wasn't me": one button that signs the account out everywhere and sends a reset link. */
export function SecureAccountConfirm({ token }: { token: string | null }) {
  const t = useTranslations("secureAccount");
  const locale = useLocale();
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [problem, setProblem] = React.useState<"invalid" | "failed" | null>(token ? null : "invalid");

  async function confirm() {
    if (!token) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await secureMyAccount(token, locale);
      if (result.ok) setDone(true);
      else setProblem(result.error);
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailCheckIcon className="size-5" aria-hidden />
            {t("doneTitle")}
          </CardTitle>
          <CardDescription>{t("doneBody")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href="/login">{t("toSignIn")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-destructive/40 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlertIcon className="size-5 text-destructive" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <ul className="list-disc space-y-1.5 ps-5">
          <li>{t("stepSignOut")}</li>
          <li>{t("stepApps")}</li>
          <li>{t("stepReset")}</li>
        </ul>
        {problem ? (
          <p className="text-destructive" role="alert">
            {t(`errors.${problem}`)}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {token && problem !== "invalid" ? (
          <Button type="button" variant="destructive" loading={busy} onClick={() => void confirm()}>
            {t("confirm")}
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/login">{t("toSignIn")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
