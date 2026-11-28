"use client";

import * as React from "react";
import { ShieldAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { ContinueSignIn } from "@/components/auth/continue-sign-in";
import { DashboardChangePasswordForm } from "@/components/dashboard/dashboard-change-password-form";
import { Link } from "@/i18n/navigation";

/** The breached-password step: change it (signing out everywhere else), then go on. */
export function BreachedPasswordForm({
  pending,
  resumesApp,
  minPasswordLength,
}: {
  pending: boolean;
  resumesApp: boolean;
  minPasswordLength: number;
}) {
  const t = useTranslations("breachedPassword");
  const [changed, setChanged] = React.useState(!pending);

  if (changed) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("doneTitle")}</CardTitle>
          <CardDescription>{t("doneBody")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {resumesApp ? (
            <ContinueSignIn label={t("continue")} auto variant="default" />
          ) : (
            <Button asChild>
              <Link href="/dashboard">{t("toAccount")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlertIcon className="size-5 text-destructive" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DashboardChangePasswordForm
          minPasswordLength={minPasswordLength}
          signOutForced
          onPasswordChanged={() => setChanged(true)}
        />
      </CardContent>
    </Card>
  );
}
