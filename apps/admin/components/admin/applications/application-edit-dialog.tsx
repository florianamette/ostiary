"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import type { OAuthApplicationRow } from "@/components/admin/applications/admin-application-row-actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { parseRedirectUris, routeError } from "@/lib/oauth-client-payload";

/**
 * Edits an admin-registered client's name, redirect URIs, icon, device grant and consent. The fields
 * start from `row` when the dialog mounts: give it a new `key` each time it opens.
 */
export function ApplicationEditDialog({
  row,
  open,
  onOpenChange,
  pending,
  onPendingChange,
  onChanged,
  onNotify,
}: {
  row: OAuthApplicationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept by the parent, so a save still running after the dialog is closed and reopened keeps Save disabled. */
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onChanged: () => void;
  onNotify: (message: string, variant?: "error" | "success") => void;
}) {
  const t = useTranslations("admin.pages.applications.rowActions");
  const tc = useTranslations("admin.common");
  const hasDeviceCode = row.grantTypes.includes(DEVICE_CODE_GRANT_TYPE);
  const [name, setName] = React.useState(row.name);
  const [redirectsRaw, setRedirectsRaw] = React.useState(row.redirectUris.join("\n"));
  const [logoUri, setLogoUri] = React.useState(row.logoUri ?? "");
  const [skipConsent, setSkipConsent] = React.useState(row.skipConsent);
  const [deviceCode, setDeviceCode] = React.useState(hasDeviceCode);
  const [error, setError] = React.useState<string | null>(null);


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const redirect_uris = parseRedirectUris(redirectsRaw);
    if (redirect_uris.length === 0) {
      setError(t("editDialog.redirectUrisRequired"));
      return;
    }
    onPendingChange(true);
    try {
      const res = await fetch(
        `/api/admin/oauth-clients/${encodeURIComponent(row.clientId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            client_name: name,
            redirect_uris,
            skip_consent: skipConsent,
            // Empty clears the icon.
            ...(logoUri.trim() !== (row.logoUri ?? "")
              ? { logo_uri: logoUri.trim() || null }
              : {}),
            ...(deviceCode !== hasDeviceCode
              ? { device_code: deviceCode }
              : {}),
          }),
        },
      );
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(routeError(json) ?? t("editDialog.updateFailed"));
        return;
      }
      onNotify(t("editDialog.updated"), "success");
      onOpenChange(false);
      onChanged();
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setError(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(ev) => void submit(ev)}>
          <DialogHeader>
            <DialogTitle>{t("editDialog.title")}</DialogTitle>
            <DialogDescription>
              {t.rich("editDialog.description", {
                clientId: row.clientId,
                endpoint: "PATCH /api/admin/oauth-clients/…",
                field: "skip_consent",
                id: (c) => <code className="font-mono text-xs">{c}</code>,
                code: (c) => <code className="text-foreground">{c}</code>,
                link: (c) => (
                  <a
                    href="https://better-auth.com/docs/plugins/oauth-provider#update-client"
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
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor={`oauth-edit-name-${row.clientId}`}>
                {t("editDialog.nameLabel")}
              </FieldLabel>
              <Input
                id={`oauth-edit-name-${row.clientId}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("editDialog.namePlaceholder")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`oauth-edit-redirects-${row.clientId}`}>
                {t("editDialog.redirectUrisLabel")}
              </FieldLabel>
              <Textarea
                id={`oauth-edit-redirects-${row.clientId}`}
                required
                rows={4}
                value={redirectsRaw}
                onChange={(e) => setRedirectsRaw(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-muted-foreground text-xs">
                {t("editDialog.redirectUrisHint")}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor={`oauth-edit-icon-${row.clientId}`}>
                {t("editDialog.iconUrlLabel")}
              </FieldLabel>
              <Input
                id={`oauth-edit-icon-${row.clientId}`}
                type="url"
                value={logoUri}
                onChange={(e) => setLogoUri(e.target.value)}
                placeholder="https://example.com/icon.png"
              />
              <p className="text-muted-foreground text-xs">
                {t("editDialog.iconUrlHint")}
              </p>
            </Field>
            <Field>
              <CheckboxField
                id={`oauth-edit-device-code-${row.clientId}`}
                checked={deviceCode}
                onChange={setDeviceCode}
                label={t("editDialog.deviceCodeLabel")}
                hint={t("editDialog.deviceCodeHint")}
              />
            </Field>
            <Field>
              <CheckboxField
                id={`oauth-edit-skip-consent-${row.clientId}`}
                checked={skipConsent}
                onChange={setSkipConsent}
                label={t("editDialog.skipConsentLabel")}
                hint={t("editDialog.skipConsentHint")}
              />
            </Field>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tc("saving") : tc("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
