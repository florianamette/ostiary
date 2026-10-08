"use client";

import * as React from "react";
import {
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

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
import { authClient } from "@/lib/auth-client";
import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";

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
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);
  const [rotateOpen, setRotateOpen] = React.useState(false);
  const [rotatePending, setRotatePending] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);

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
      setEditError("Enter at least one redirect URI (one per line or comma-separated).");
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
            : "Could not update application";
        setEditError(err);
        return;
      }
      onNotify("Application updated", "success");
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
      const { error } = await authClient.oauth2.deleteClient({
        client_id: row.clientId,
      });
      if (error) {
        onNotify(error.message ?? "Could not delete client", "error");
        return;
      }
      onNotify("Application removed", "success");
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
      const { data, error } = await authClient.oauth2.client.rotateSecret({
        client_id: row.clientId,
      });
      if (error) {
        onNotify(error.message ?? "Could not rotate secret", "error");
        return;
      }
      const secret =
        data &&
        typeof data === "object" &&
        "client_secret" in data &&
        typeof (data as { client_secret?: string }).client_secret === "string"
          ? (data as { client_secret: string }).client_secret
          : null;
      if (secret) {
        setNewSecret(secret);
        onNotify("New client secret issued, copy it now", "success");
      } else {
        onNotify("Secret rotated", "success");
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
            aria-label={`Actions for ${row.name}`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(row.clientId);
              onNotify("Client ID copied", "success");
            }}
          >
            <CopyIcon />
            Copy client ID
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => openEdit()}
            title="Name, redirect URIs, device sign-in and skip consent"
          >
            <PencilIcon />
            Edit application
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canRotateSecret}
            title={
              row.public
                ? "Public clients have no secret"
                : row.disabled
                  ? "Enable the client first"
                  : "Rotates the confidential client secret"
            }
            onClick={() => setRotateOpen(true)}
          >
            <KeyRoundIcon />
            Rotate secret
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={row.disabled}
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2Icon />
            Delete application
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
              <DialogTitle>Edit application</DialogTitle>
              <DialogDescription>
                Updates{" "}
                <code className="font-mono text-xs">{row.clientId}</code> via{" "}
                <code className="text-foreground">
                  PATCH /api/admin/oauth-clients/…
                </code>{" "}
                (restricted fields such as{" "}
                <code className="text-foreground">skip_consent</code>). See{" "}
                <a
                  href="https://better-auth.com/docs/plugins/oauth-provider#update-client"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Better Auth, Update client
                </a>
                .
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor={`oauth-edit-name-${row.clientId}`}>
                  Application name
                </FieldLabel>
                <Input
                  id={`oauth-edit-name-${row.clientId}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="My app"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`oauth-edit-redirects-${row.clientId}`}>
                  Redirect URIs
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
                  One per line or comma-separated. HTTPS required. Only public
                  clients may use http on localhost.
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
                      Device sign-in (CLIs, TVs)
                    </Label>
                    <p className="text-muted-foreground text-xs leading-snug">
                      Allows the device code grant. Turning it off stops new
                      device sign-ins; tokens already issued keep working.
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
                      Skip consent (trusted client)
                    </Label>
                    <p className="text-muted-foreground text-xs leading-snug">
                      When enabled, users are not prompted to approve scopes for
                      this application.
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
                Cancel
              </Button>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete application?</DialogTitle>
            <DialogDescription>
              Permanently removes{" "}
              <span className="font-medium text-foreground">{row.name}</span> (
              <code className="font-mono text-xs">{row.clientId}</code>). OAuth
              tokens and consents for this client may be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removePending}
              onClick={() => void removeClient()}
            >
              {removePending ? "Deleting…" : "Delete"}
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
            <DialogTitle>Rotate client secret?</DialogTitle>
            <DialogDescription>
              The previous secret stops working immediately. Save the new secret
              somewhere safe, it may only be shown once.
            </DialogDescription>
          </DialogHeader>
          {newSecret ? (
            <div className="grid gap-2 py-2">
              <Label>New client secret</Label>
              <Input readOnly value={newSecret} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  void navigator.clipboard.writeText(newSecret);
                  onNotify("Secret copied", "success");
                }}
              >
                <CopyIcon />
                Copy secret
              </Button>
            </div>
          ) : null}
          <DialogFooter>
            {newSecret ? (
              <Button onClick={() => closeRotateDialog()}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRotateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={rotatePending}
                  onClick={() => void rotateSecret()}
                >
                  {rotatePending ? "Rotating…" : "Rotate secret"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
