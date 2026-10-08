"use client";

import * as React from "react";
import { CopyIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { generateScimToken, revokeScimTokens } from "@/app/[locale]/(console)/organizations/[id]/scim-actions";

/** The active token's dates, formatted for display. */
export type ScimTokenSummary = {
  created: string;
  expires: string;
  lastUsed: string | null;
};

function CopyField({ id, label, value, description }: { id: string; label: string; value: string; description?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} readOnly className="font-mono text-xs" value={value} onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => toast.success("Copied"));
          }}
        >
          <CopyIcon />
        </Button>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

/**
 * SCIM card on the organization page: the base URL to paste into the identity provider,
 * the current token's dates, and buttons to issue, replace or revoke it. A new token is
 * shown once, in a dialog.
 */
export function OrganizationScim({
  orgId,
  baseUrl,
  token,
}: {
  orgId: string;
  baseUrl: string;
  token: ScimTokenSummary | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"generate" | "revoke" | null>(null);
  const [confirm, setConfirm] = React.useState<"rotate" | "revoke" | null>(null);
  const [issued, setIssued] = React.useState<string | null>(null);

  async function generate() {
    setBusy("generate");
    try {
      const result = await generateScimToken(orgId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirm(null);
      setIssued(result.token);
      router.refresh();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    try {
      const result = await revokeScimTokens(orgId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirm(null);
      toast.success("Token revoked");
      router.refresh();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <FieldGroup>
        <CopyField id="scim-base-url" label="Base URL" value={baseUrl} />
      </FieldGroup>

      {token ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Token</dt>
          <dd>Active</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{token.created}</dd>
          <dt className="text-muted-foreground">Expires</dt>
          <dd>{token.expires}</dd>
          <dt className="text-muted-foreground">Last used</dt>
          <dd>{token.lastUsed ?? "Never"}</dd>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No active token. The identity provider can&apos;t provision until you generate one.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {token ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirm("rotate")}>
              New token
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirm("revoke")}>
              Revoke
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => void generate()}>
            {busy === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Generate token
          </Button>
        )}
      </div>

      <Dialog open={confirm !== null} onOpenChange={(next) => !busy && !next && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "rotate" ? "Replace the SCIM token?" : "Revoke the SCIM token?"}</DialogTitle>
            <DialogDescription>
              {confirm === "rotate"
                ? "The current token stops working now. Paste the new one into your identity provider to keep provisioning."
                : "Your identity provider can no longer create, update or deactivate accounts. Existing accounts are not changed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirm === "revoke" ? "destructive" : "default"}
              disabled={busy !== null}
              onClick={() => void (confirm === "rotate" ? generate() : revoke())}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {confirm === "rotate" ? "Replace token" : "Revoke token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issued !== null} onOpenChange={(next) => !next && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>SCIM token</DialogTitle>
            <DialogDescription>Copy it now: it is not shown again. It expires in one year.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-2">
            <CopyField id="scim-issued-base-url" label="Base URL" value={baseUrl} />
            <CopyField
              id="scim-issued-token"
              label="Token"
              value={issued ?? ""}
              description="Paste it as the bearer token (Okta: API token, Entra ID: secret token)."
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" onClick={() => setIssued(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
