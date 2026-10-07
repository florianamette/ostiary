"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function AcceptInvitationForm({
  invitationId,
}: {
  invitationId: string;
}) {
  const t = useTranslations("acceptInvitation");
  const locale = useLocale();
  const { data: sessionData, isPending: sessionPending } =
    authClient.useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const returnPath = `/${locale}/accept-invitation/${invitationId}`;
  const loginHref = `/login?callbackURL=${encodeURIComponent(returnPath)}`;

  async function handleAccept() {
    setSubmitting(true);
    try {
      const res = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (res.error) {
        toast.error(String(res.error.message ?? t("error")));
        return;
      }
      setDone(true);
      toast.success(t("success"));
      window.location.assign("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionPending) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex items-center justify-center gap-2 pt-8 pb-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <span className="text-sm">{t("loading")}</span>
        </CardContent>
      </Card>
    );
  }

  if (!sessionData?.user) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("needSignInTitle")}</CardTitle>
          <CardDescription>{t("needSignInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={loginHref}>{t("signIn")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("successTitle")}</CardTitle>
          <CardDescription>{t("successDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("signedInAs", { email: sessionData.user.email })}
        </p>
        <Button
          type="button"
          className="w-full"
          disabled={submitting}
          onClick={() => void handleAccept()}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {submitting ? t("accepting") : t("accept")}
        </Button>
      </CardContent>
    </Card>
  );
}
