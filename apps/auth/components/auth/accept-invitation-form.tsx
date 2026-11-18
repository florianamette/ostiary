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
import { useAuthErrorMessage } from "@/lib/auth-error-message";

export function AcceptInvitationForm({
  invitationId,
}: {
  invitationId: string;
}) {
  const t = useTranslations("acceptInvitation");
  const locale = useLocale();
  const errorMessage = useAuthErrorMessage();
  const { data: sessionData, isPending: sessionPending } =
    authClient.useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const returnPath = `/${locale}/accept-invitation/${invitationId}`;
  const loginHref = `/login?callbackURL=${encodeURIComponent(returnPath)}`;

  async function handleAccept() {
    setSubmitting(true);
    let leaving = false;
    try {
      const res = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (res.error) {
        toast.error(errorMessage(res.error, t("error")));
        return;
      }
      leaving = true;
      setDone(true);
      toast.success(t("success"));
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: the new membership changes what server components render
      window.location.assign("/dashboard");
    } catch {
      toast.error(t("error"));
    } finally {
      if (!leaving) setSubmitting(false);
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
          loading={submitting}
          onClick={() => void handleAccept()}
        >
          {submitting ? t("accepting") : t("accept")}
        </Button>
      </CardContent>
    </Card>
  );
}
