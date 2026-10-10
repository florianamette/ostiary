"use client";

import * as React from "react";
import { CopyIcon, PlusCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ostiary/core/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import { MotionPanel } from "@ostiary/core/components/motion/motion-panel";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";
import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { asRecord, parseRedirectUris, routeError } from "@/lib/oauth-client-payload";

export function AdminRegisterOAuthClientDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const t = useTranslations("admin.pages.applications.register");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"form" | "success">("form");
  const [clientName, setClientName] = React.useState("");
  const [redirectUrisRaw, setRedirectUrisRaw] = React.useState("");
  const [clientKind, setClientKind] = React.useState<"confidential" | "public">(
    "confidential"
  );
  const [skipConsent, setSkipConsent] = React.useState(false);
  const [deviceCode, setDeviceCode] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [issuedClientId, setIssuedClientId] = React.useState("");
  const [issuedSecret, setIssuedSecret] = React.useState<string | null>(null);

  function reset() {
    setStep("form");
    setClientName("");
    setRedirectUrisRaw("");
    setClientKind("confidential");
    setSkipConsent(false);
    setDeviceCode(false);
    setFormError(null);
    setIssuedClientId("");
    setIssuedSecret(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const redirect_uris = parseRedirectUris(redirectUrisRaw);
    if (redirect_uris.length === 0) {
      setFormError(t("redirectUrisRequired"));
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/oauth-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          redirect_uris,
          client_name: clientName.trim() || undefined,
          token_endpoint_auth_method:
            clientKind === "public" ? "none" : "client_secret_basic",
          grant_types: [
            "authorization_code",
            "refresh_token",
            ...(deviceCode ? [DEVICE_CODE_GRANT_TYPE] : []),
          ],
          response_types: ["code"],
          type: clientKind === "public" ? "native" : "web",
          skip_consent: skipConsent,
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(routeError(json) ?? t("registerFailed"));
        return;
      }
      const payload =
        json &&
        typeof json === "object" &&
        "data" in json &&
        (json as { data: unknown }).data !== undefined
          ? (json as { data: unknown }).data
          : json;
      const o = asRecord(payload);
      const cid = o ? String(o.client_id ?? o.clientId ?? "") : "";
      if (!cid) {
        setFormError(t("missingClientId", { field: "client_id" }));
        return;
      }
      const secretRaw = o?.client_secret ?? o?.clientSecret;
      const secret =
        typeof secretRaw === "string" && secretRaw.length > 0
          ? secretRaw
          : null;
      setIssuedClientId(cid);
      setIssuedSecret(secret);
      setStep("success");
      adminNotify(t("registered"));
      onCreated();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          <PlusCircleIcon />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {t.rich("description", {
                  endpoint: "POST /api/admin/oauth-clients",
                  field: "skip_consent",
                  code: (c) => <code className="text-foreground">{c}</code>,
                  link: (c) => (
                    <a
                      href="https://better-auth.com/docs/plugins/oauth-provider#create-client"
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c}
                    </a>
                  ),
                })}
              </DialogDescription>
            </DialogHeader>
            <MotionPanel>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="oauth-reg-name">{t("nameLabel")}</FieldLabel>
                <Input
                  id="oauth-reg-name"
                  placeholder={t("namePlaceholder")}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="oauth-reg-redirects">
                  {t("redirectUrisLabel")}
                </FieldLabel>
                <Textarea
                  id="oauth-reg-redirects"
                  required
                  rows={4}
                  placeholder={
                    "https://app.example.com/oauth/callback\nhttp://127.0.0.1:3000/callback"
                  }
                  value={redirectUrisRaw}
                  onChange={(e) => setRedirectUrisRaw(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-muted-foreground text-xs">
                  {clientKind === "public"
                    ? t("redirectUrisHintPublic")
                    : t("redirectUrisHintConfidential")}
                </p>
              </Field>
              <Field>
                <FieldLabel>{t("clientTypeLabel")}</FieldLabel>
                <Select
                  value={clientKind}
                  onValueChange={(v) =>
                    setClientKind(v as "confidential" | "public")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidential">
                      {t("clientTypeConfidential")}
                    </SelectItem>
                    <SelectItem value="public">
                      {t("clientTypePublic")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <CheckboxField
                  id="oauth-reg-device-code"
                  checked={deviceCode}
                  onChange={setDeviceCode}
                  label={t("deviceCodeLabel")}
                  hint={t.rich("deviceCodeHint", {
                    path: "/device",
                    code: (c) => <code>{c}</code>,
                  })}
                />
              </Field>
              <Field>
                <CheckboxField
                  id="oauth-reg-skip-consent"
                  checked={skipConsent}
                  onChange={setSkipConsent}
                  label={t("skipConsentLabel")}
                  hint={t("skipConsentHint")}
                />
              </Field>
              {formError ? (
                <p className="text-destructive text-sm" role="alert">
                  {formError}
                </p>
              ) : null}
            </FieldGroup>
            </MotionPanel>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("successTitle")}</DialogTitle>
              <DialogDescription>
                {issuedSecret
                  ? t("successWithSecret")
                  : t("successPublic")}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel>{t("clientId")}</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    className="font-mono text-xs"
                    value={issuedClientId}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={t("copyClientId")}
                    onClick={() => {
                      void navigator.clipboard.writeText(issuedClientId);
                    }}
                  >
                    <CopyIcon />
                  </Button>
                </div>
              </Field>
              {issuedSecret ? (
                <Field>
                  <FieldLabel>{t("clientSecret")}</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      className="font-mono text-xs"
                      value={issuedSecret}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={t("copyClientSecret")}
                      onClick={() => {
                        void navigator.clipboard.writeText(issuedSecret);
                      }}
                    >
                      <CopyIcon />
                    </Button>
                  </div>
                </Field>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                {tc("done")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
