"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { PHONE_NUMBER_PATTERN } from "@ostiary/core/lib/phone-number";
import { SIGN_IN_CODE_LENGTH } from "@ostiary/core/lib/sign-in-code";

import { authClient } from "@/lib/auth-client";
import { useAuthErrorMessage } from "@/lib/auth-error-message";
import { removeMyPhoneNumber } from "@/lib/phone-number-actions";

/**
 * The account's phone number, for signing in with a texted code (sms.ts). Adding or changing
 * it sends a code to the new number; it is saved once the code is typed.
 */
export function DashboardPhoneSection({ phoneNumber }: { phoneNumber: string | null }) {
  const t = useTranslations("dashboard.phone");
  const errorMessage = useAuthErrorMessage();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = phone.replace(/[\s().-]/g, "");
    if (!PHONE_NUMBER_PATTERN.test(value)) {
      toast.error(t("invalidPhone"));
      return;
    }
    setBusy(true);
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: value });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error, t("sendFailed")));
      return;
    }
    setPhone(value);
    setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.phoneNumber.verify({ phoneNumber: phone, code, updatePhoneNumber: true });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error, t("verifyFailed"), { PHONE_NUMBER_EXIST: t("taken") }));
      return;
    }
    toast.success(t("saved"));
    setEditing(false);
    setSent(false);
    setCode("");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const { ok } = await removeMyPhoneNumber();
    setBusy(false);
    if (!ok) {
      toast.error(t("removeFailed"));
      return;
    }
    toast.success(t("removed"));
    router.refresh();
  }

  return (
    <section id="phone" className="scroll-mt-32 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm">{phoneNumber ?? t("none")}</span>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {phoneNumber ? t("change") : t("add")}
          </Button>
          {phoneNumber ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void remove()}>
              {t("remove")}
            </Button>
          ) : null}
        </div>
      ) : !sent ? (
        <form onSubmit={(e) => void send(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dashboard-phone">{t("phoneLabel")}</FieldLabel>
              <Input id="dashboard-phone" type="tel" autoComplete="tel" placeholder="+33612345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
              <FieldDescription>{t("phoneHint")}</FieldDescription>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={busy}>
                {t("send")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : (
        <form onSubmit={(e) => void verify(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dashboard-phone-code">{t("codeLabel", { phone })}</FieldLabel>
              <Input
                id="dashboard-phone-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={SIGN_IN_CODE_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={busy}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={busy} disabled={code.length !== SIGN_IN_CODE_LENGTH}>
                {t("verify")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSent(false)}>
                {t("cancel")}
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
    </section>
  );
}
