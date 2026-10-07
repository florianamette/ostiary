"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { authClient } from "@/lib/auth-client";

/**
 * Current email with its verification status, and the change-email flow: the current inbox
 * approves the change with a one-time link, then the new address is verified. Only offered
 * once the current address is verified (the server enforces the same rule).
 */
export function DashboardEmailField({
  email,
  emailVerified,
}: {
  email: string;
  emailVerified: boolean;
}) {
  const t = useTranslations("dashboard.profile");
  const locale = useLocale();
  const [verificationPending, setVerificationPending] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [changing, setChanging] = React.useState(false);
  const [requestedFor, setRequestedFor] = React.useState<string | null>(null);

  async function handleResendVerification() {
    setVerificationPending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `/${locale}/dashboard`,
      });
      if (error) {
        toast.error(error.message ?? t("verificationError"));
        return;
      }
      toast.success(t("verificationSent"));
    } finally {
      setVerificationPending(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    const target = newEmail.trim().toLowerCase();
    if (!target || target === email.toLowerCase()) {
      toast.error(t("changeEmailSame"));
      return;
    }
    setChanging(true);
    try {
      const { error } = await authClient.changeEmail({
        newEmail: target,
        callbackURL: `/${locale}/dashboard`,
      });
      if (error) {
        toast.error(error.message ?? t("changeEmailError"));
        return;
      }
      setRequestedFor(target);
      setEditing(false);
      setNewEmail("");
    } finally {
      setChanging(false);
    }
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{t("emailLabel")}</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 truncate text-sm text-foreground">{email}</span>
          <div className="flex flex-wrap items-center gap-2">
            {emailVerified ? (
              <Badge variant="secondary">{t("verified")}</Badge>
            ) : (
              <>
                <Badge variant="outline">{t("unverified")}</Badge>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={verificationPending}
                  onClick={() => void handleResendVerification()}
                >
                  {verificationPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {t("resendVerification")}
                </Button>
              </>
            )}
            {editing || !emailVerified ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(true);
                  setRequestedFor(null);
                }}
              >
                {t("changeEmail")}
              </Button>
            )}
          </div>
        </div>
        {!emailVerified ? (
          <FieldDescription>
            {t("unverifiedHint")} {t("changeEmailNeedsVerified")}
          </FieldDescription>
        ) : null}
        {requestedFor ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
            {t("changeEmailSentToCurrent", { current: email, next: requestedFor })}
          </p>
        ) : null}
      </Field>

      {editing ? (
        <form onSubmit={handleChangeEmail} className="space-y-3 rounded-lg border border-border/80 p-4">
          <Field>
            <FieldLabel htmlFor="dashboard-new-email">{t("newEmailLabel")}</FieldLabel>
            <Input
              id="dashboard-new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={changing}
              required
              autoFocus
            />
            <FieldDescription>{t("changeEmailHintVerified")}</FieldDescription>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={changing || !newEmail.trim()}>
              {changing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {changing ? t("changingEmail") : t("changeEmailSubmit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={changing}
              onClick={() => {
                setEditing(false);
                setNewEmail("");
              }}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </FieldGroup>
  );
}
