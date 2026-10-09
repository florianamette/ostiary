"use client";

import * as React from "react";
import {
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import type { RegistrationSource } from "@ostiary/core/lib/client-registration-policy";
import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import { AppBrandingDialog } from "@/components/admin/applications/app-branding-dialog";

/** The `error` of an admin route's JSON answer, if any. */
async function errorMessage(res: Response): Promise<string | null> {
  const json: unknown = await res.json().catch(() => null);
  return json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
    ? (json as { error: string }).error
    : null;
}

function parseRedirectUris(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type OAuthApplicationRow = {
  clientId: string;
  name: string;
  public: boolean;
  skipConsent: boolean;
  disabled: boolean;
  tokenEndpointAuthMethod:
    | "none"
    | "client_secret_basic"
    | "client_secret_post"
    | "private_key_jwt";
  grantTypes: string[];
  redirectUris: string[];
  createdAt: string;
  /** Registered by an admin, or by the client itself (see client-registration-policy.ts). */
  registration: RegistrationSource;
};

export function AdminApplicationRowActions({
  row,
  onChanged,
  onNotify,
}: {
  row: OAuthApplicationRow;
  onChanged: () => void;
  onNotify: (message: string, variant?: "error" | "success") => void;
}) {
  const t = useTranslations("admin.pages.applications.rowActions");
  const tc = useTranslations("admin.common");
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);
  const [rotateOpen, setRotateOpen] = React.useState(false);
  const [rotatePending, setRotatePending] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);

  const [brandingOpen, setBrandingOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editPending, setEditPending] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editRedirectsRaw, setEditRedirectsRaw] = React.useState("");
  const [editSkipConsent, setEditSkipConsent] = React.useState(false);
  const [editDeviceCode, setEditDeviceCode] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const canRotateSecret = !row.public && !row.disabled;
  const hasDeviceCode = row.grantTypes.includes(DEVICE_CODE_GRANT_TYPE);

  function openEdit() {
    setEditName(row.name);
    setEditRedirectsRaw(row.redirectUris.join("\n"));
    setEditSkipConsent(row.skipConsent);
    setEditDeviceCode(hasDeviceCode);
    setEditError(null);
    setEditOpen(true);
  }

  function resetEdit() {
    setEditError(null);
    setEditPending(false);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    const redirect_uris = parseRedirectUris(editRedirectsRaw);
    if (redirect_uris.length === 0) {
      setEditError(t("editDialog.redirectUrisRequired"));
      return;
    }
    setEditPending(true);
    try {
      const res = await fetch(
        `/api/admin/oauth-clients/${encodeURIComponent(row.clientId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            client_name: editName,
            redirect_uris,
            skip_consent: editSkipConsent,
            ...(editDeviceCode !== hasDeviceCode
              ? { device_code: editDeviceCode }
              : {}),
          }),
        },
      );
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error?: unknown }).error === "string"
            ? (json as { error: string }).error
            : t("editDialog.updateFailed");
        setEditError(err);
        return;
      }
      onNotify(t("editDialog.updated"), "success");
      setEditOpen(false);
      resetEdit();
      onChanged();
    } finally {
      setEditPending(false);
    }
  }

  async function removeClient() {
    setRemovePending(true);
    try {
      const res = await fetch(
        `/api/admin/oauth-clients/${encodeURIComponent(row.clientId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        onNotify((await errorMessage(res)) ?? t("deleteDialog.deleteFailed"), "error");
        return;
      }
      onNotify(t("deleteDialog.deleted"), "success");
      setRemoveOpen(false);
      onChanged();
    } finally {
      setRemovePending(false);
    }
  }

  async function rotateSecret() {
    setRotatePending(true);
    setNewSecret(null);
    try {
      const res = await fetch(
        `/api/admin/oauth-clients/${encodeURIComponent(row.clientId)}/rotate-secret`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        onNotify((await errorMessage(res)) ?? t("rotateDialog.rotateFailed"), "error");
        return;
      }
      const json: unknown = await res.json().catch(() => null);
      const data =
        json && typeof json === "object" && "data" in json
          ? (json as { data: unknown }).data
          : null;
      const secret =
        data &&
        typeof data === "object" &&
        "client_secret" in data &&
        typeof (data as { client_secret?: string }).client_secret === "string"
          ? (data as { client_secret: string }).client_secret
          : null;
      if (secret) {
        setNewSecret(secret);
        onNotify(t("rotateDialog.newSecretIssued"), "success");
      } else {
        onNotify(t("rotateDialog.rotated"), "success");
        setRotateOpen(false);
        onChanged();
      }
    } finally {
      setRotatePending(false);
    }
  }

  function closeRotateDialog() {
    setRotateOpen(false);
    setNewSecret(null);
    onChanged();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("menuLabel", { name: row.name })}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(row.clientId);
              onNotify(t("clientIdCopied"), "success");
            }}
          >
            <CopyIcon />
            {t("copyClientId")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => openEdit()}
            title={t("editHint")}
          >
            <PencilIcon />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setBrandingOpen(true)}
            title={t("brandingHint")}
          >
            <PaletteIcon />
            {t("branding")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canRotateSecret}
            title={
              row.public
                ? t("rotateHintPublic")
                : row.disabled
                  ? t("rotateHintDisabled")
                  : t("rotateHint")
            }
            onClick={() => setRotateOpen(true)}
          >
            <KeyRoundIcon />
            {t("rotateSecret")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={row.disabled}
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2Icon />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AppBrandingDialog
        clientId={row.clientId}
        open={brandingOpen}
        onOpenChange={setBrandingOpen}
        onNotify={onNotify}
      />

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) resetEdit();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(ev) => void submitEdit(ev)}>
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
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
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
                  value={editRedirectsRaw}
                  onChange={(e) => setEditRedirectsRaw(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-muted-foreground text-xs">
                  {t("editDialog.redirectUrisHint")}
                </p>
              </Field>
              <Field>
                <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
                  <input
                    id={`oauth-edit-device-code-${row.clientId}`}
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 rounded border-input"
                    checked={editDeviceCode}
                    onChange={(e) => setEditDeviceCode(e.target.checked)}
                  />
                  <div className="grid gap-1">
                    <Label
                      htmlFor={`oauth-edit-device-code-${row.clientId}`}
                      className="cursor-pointer font-medium leading-none"
                    >
                      {t("editDialog.deviceCodeLabel")}
                    </Label>
                    <p className="text-muted-foreground text-xs leading-snug">
                      {t("editDialog.deviceCodeHint")}
                    </p>
                  </div>
                </div>
              </Field>
              <Field>
                <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
                  <input
                    id={`oauth-edit-skip-consent-${row.clientId}`}
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 rounded border-input"
                    checked={editSkipConsent}
                    onChange={(e) => setEditSkipConsent(e.target.checked)}
                  />
                  <div className="grid gap-1">
                    <Label
                      htmlFor={`oauth-edit-skip-consent-${row.clientId}`}
                      className="cursor-pointer font-medium leading-none"
                    >
                      {t("editDialog.skipConsentLabel")}
                    </Label>
                    <p className="text-muted-foreground text-xs leading-snug">
                      {t("editDialog.skipConsentHint")}
                    </p>
                  </div>
                </div>
              </Field>
              {editError ? (
                <p className="text-destructive text-sm" role="alert">
                  {editError}
                </p>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={editPending}>
                {editPending ? tc("saving") : tc("saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t.rich("deleteDialog.description", {
                name: row.name,
                clientId: row.clientId,
                strong: (c) => <span className="font-medium text-foreground">{c}</span>,
                code: (c) => <code className="font-mono text-xs">{c}</code>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={removePending}
              onClick={() => void removeClient()}
            >
              {removePending ? tc("deleting") : tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rotateOpen}
        onOpenChange={(o) => {
          if (!o) closeRotateDialog();
          else setRotateOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("rotateDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("rotateDialog.description")}
            </DialogDescription>
          </DialogHeader>
          {newSecret ? (
            <div className="grid gap-2 py-2">
              <Label>{t("rotateDialog.newSecretLabel")}</Label>
              <Input readOnly value={newSecret} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  void navigator.clipboard.writeText(newSecret);
                  onNotify(t("rotateDialog.secretCopied"), "success");
                }}
              >
                <CopyIcon />
                {t("rotateDialog.copySecret")}
              </Button>
            </div>
          ) : null}
          <DialogFooter>
            {newSecret ? (
              <Button onClick={() => closeRotateDialog()}>{tc("done")}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRotateOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button
                  disabled={rotatePending}
                  onClick={() => void rotateSecret()}
                >
                  {rotatePending ? t("rotateDialog.rotating") : t("rotateSecret")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
