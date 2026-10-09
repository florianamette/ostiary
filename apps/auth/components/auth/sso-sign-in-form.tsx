"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { authClient } from "@/lib/auth-client";

/**
 * Starts SSO from a work email: Better Auth finds the provider registered for that
 * email's domain (see the admin app's SSO page) and redirects to its identity provider.
 */
export function SsoSignInForm() {
  const t = useTranslations("sso");
  const locale = useLocale();
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const { error } = await authClient.signIn.sso({
        email: email.trim().toLowerCase(),
        callbackURL: `/${locale}/dashboard`,
        // Refused answers from the identity provider come back to this page with ?error=.
        errorCallbackURL: `/${locale}/sso`,
      });
      if (error) {
        toast.error(String(error.message ?? t("signInError")));
        return;
      }
    } catch {
      toast.error(t("signInError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="sso-email">{t("signInEmail")}</FieldLabel>
          <Input
            id="sso-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            required
          />
        </Field>
        <Field>
          <Button type="submit" disabled={pending || !email.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("signInSubmit")}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
