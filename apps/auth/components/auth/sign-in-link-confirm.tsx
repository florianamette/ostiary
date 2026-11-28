"use client";

import * as React from "react";
import { LogInIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Link } from "@/i18n/navigation";

/** "Sign in as …": one button, so that opening the link alone signs nothing in. */
export function SignInLinkConfirm({ email, verifyURL }: { email: string | null; verifyURL: string | null }) {
  const t = useTranslations("signInLink");
  const [busy, setBusy] = React.useState(false);

  if (!email || !verifyURL) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("invalidTitle")}</CardTitle>
          <CardDescription>{t("invalidBody")}</CardDescription>
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
    <Card className="w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogInIcon className="size-5" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description", { email })}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{t("note")}</CardContent>
      <CardFooter>
        <Button
          type="button"
          loading={busy}
          onClick={() => {
            setBusy(true);
            // A full navigation: Better Auth sets the session cookie and redirects on.
            window.location.assign(verifyURL);
          }}
        >
          {t("signIn")}
        </Button>
      </CardFooter>
    </Card>
  );
}
