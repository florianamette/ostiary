"use client";

import * as React from "react";
import { CopyIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

function CopyField({
  id,
  label,
  copyLabel,
  value,
  description,
}: {
  id: string;
  label: string;
  copyLabel: string;
  value: string;
  description?: string;
}) {
  const tc = useTranslations("admin.common");
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} readOnly className="font-mono text-xs" value={value} onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={copyLabel}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => toast.success(tc("copied")));
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
  const t = useTranslations("admin.pages.organizations.scim");
  const tc = useTranslations("admin.common");
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
      toast.error(t("unexpectedError"));
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
      toast.success(t("tokenRevoked"));
      router.refresh();
    } catch {
      toast.error(t("unexpectedError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <FieldGroup>
        <CopyField id="scim-base-url" label={t("baseUrl")} copyLabel={t("copyBaseUrl")} value={baseUrl} />
      </FieldGroup>

      {token ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("token")}</dt>
          <dd>{t("active")}</dd>
          <dt className="text-muted-foreground">{tc("created")}</dt>
          <dd>{token.created}</dd>
          <dt className="text-muted-foreground">{t("expires")}</dt>
          <dd>{token.expires}</dd>
          <dt className="text-muted-foreground">{t("lastUsed")}</dt>
          <dd>{token.lastUsed ?? tc("never")}</dd>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noToken")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {token ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirm("rotate")}>
              {t("newToken")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirm("revoke")}>
              {t("revoke")}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => void generate()}>
            {busy === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("generateToken")}
          </Button>
        )}
      </div>

      <Dialog open={confirm !== null} onOpenChange={(next) => !busy && !next && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "rotate" ? t("rotateTitle") : t("revokeTitle")}</DialogTitle>
            <DialogDescription>
              {confirm === "rotate" ? t("rotateBody") : t("revokeBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setConfirm(null)}>
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              variant={confirm === "revoke" ? "destructive" : "default"}
              disabled={busy !== null}
              onClick={() => void (confirm === "rotate" ? generate() : revoke())}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {confirm === "rotate" ? t("replaceToken") : t("revokeToken")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issued !== null} onOpenChange={(next) => !next && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("issuedTitle")}</DialogTitle>
            <DialogDescription>{t("issuedDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-2">
            <CopyField id="scim-issued-base-url" label={t("baseUrl")} copyLabel={t("copyBaseUrl")} value={baseUrl} />
            <CopyField
              id="scim-issued-token"
              label={t("token")}
              copyLabel={t("copyToken")}
              value={issued ?? ""}
              description={t("tokenHint")}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" onClick={() => setIssued(null)}>
              {tc("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
