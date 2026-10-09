"use client";

import * as React from "react";
import { CheckCircle2Icon, Loader2, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { brand } from "@ostiary/core/lib/brand";
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

type Problem = "missing" | "invalid" | "blocked" | "failed";

/** The final confirmation, from the emailed link. */
export function DeleteAccountConfirm({ token, email }: { token: string | null; email: string | null }) {
  const t = useTranslations("deleteAccount");
  const tLimit = useTranslations("rateLimit");
  const [busy, setBusy] = React.useState(false);
  const [deleted, setDeleted] = React.useState(false);
  const [problem, setProblem] = React.useState<{ key: Problem; limited?: string | null } | null>(
    token ? null : { key: "missing" },
  );

  async function confirm() {
    if (!token) return;
    setBusy(true);
    setProblem(null);
    try {
      const { error } = await authClient.deleteUser({ token });
      if (error) {
        const key: Problem =
          error.code === "ACCOUNT_DELETION_BLOCKED"
            ? "blocked"
            : error.code === "INVALID_TOKEN" || error.status === 404
              ? "invalid"
              : "failed";
        setProblem({ key, limited: rateLimitMessage(error, tLimit) });
        return;
      }
      setDeleted(true);
    } catch {
      setProblem({ key: "failed" });
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2Icon className="size-5" aria-hidden />
            {t("deletedTitle")}
          </CardTitle>
          <CardDescription>{t("deletedBody", { brand: brand.name })}</CardDescription>
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
          <TriangleAlertIcon className="size-5 text-destructive" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{email ? t("description", { email }) : t("signedOut")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <ul className="list-disc space-y-1.5 ps-5">
          <li>{t("consequenceApps")}</li>
          <li>{t("consequenceSignIn")}</li>
          <li>{t("consequenceUndo")}</li>
        </ul>
        {problem ? (
          <p className="text-destructive" role="alert">
            {problem.limited ?? t(`errors.${problem.key}`)}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {token && email && problem?.key !== "invalid" && problem?.key !== "blocked" ? (
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("confirm")}
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/dashboard#data">{t("keep")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
