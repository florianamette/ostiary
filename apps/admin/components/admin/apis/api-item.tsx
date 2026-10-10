"use client";

import * as React from "react";
import { Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import type { TokenSettings } from "@ostiary/core/lib/oauth-resource-policy";
import { deleteApi } from "@/app/[locale]/(console)/apis/actions";
import type { ApiRow, ApplicationOption } from "@/components/admin/apis/admin-apis-panel";
import { ApiAccessDialogBody, ApiEditDialogBody, ApiTokensDialogBody } from "@/components/admin/apis/api-dialogs";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

type Translator = ReturnType<typeof useTranslations<"admin.pages.apis">>;

/** A lifetime in seconds, in the largest unit that divides it. */
function formatDuration(seconds: number, t: Translator): string {
  if (seconds % 86_400 === 0) return t("duration.days", { count: seconds / 86_400 });
  if (seconds % 3_600 === 0) return t("duration.hours", { count: String(seconds / 3_600) });
  return t("duration.minutes", { count: String(Math.round(seconds / 60)) });
}

/** The token settings that differ from the defaults, for the API list. */
function tokenSummary(tokens: TokenSettings, t: Translator): string[] {
  const claims = Object.keys(tokens.customClaims ?? {});
  return [
    tokens.accessTokenTtl !== null
      ? t("tokenSummary.accessToken", { duration: formatDuration(tokens.accessTokenTtl, t) })
      : null,
    tokens.refreshTokenTtl !== null
      ? t("tokenSummary.refreshToken", { duration: formatDuration(tokens.refreshTokenTtl, t) })
      : null,
    tokens.dpopBoundAccessTokensRequired ? t("tokenSummary.dpopRequired") : null,
    claims.length > 0 ? t("tokenSummary.claims", { claims: claims.join(", ") }) : null,
  ].filter((part): part is string => part !== null);
}

export function ApiItem({ api, applications }: { api: ApiRow; applications: ApplicationOption[] }) {
  const t = useTranslations("admin.pages.apis");
  const tc = useTranslations("admin.common");
  const [dialog, setDialog] = React.useState<"edit" | "access" | "tokens" | "delete" | null>(null);
  const closeDialog = () => setDialog(null);
  const { busy, run } = useAdminAction(closeDialog);

  const appNames = new Map(applications.map((app) => [app.clientId, app.name]));
  const linkedNames = api.linkedClientIds.map((clientId) => appNames.get(clientId) ?? clientId);
  const tokens = tokenSummary(api.tokens, t);
  const dialogProps = { api, busy, run, onCancel: closeDialog };

  return (
    <li className="rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {api.name}
            {api.authServer ? <Badge variant="secondary">{t("item.authServer")}</Badge> : null}
            {api.fromEnv && !api.authServer ? <Badge variant="outline">OAUTH_API_AUDIENCES</Badge> : null}
            {api.disabled ? <Badge variant="destructive">{tc("disabled")}</Badge> : null}
            {api.restrict ? <Badge variant="outline">{t("item.restricted")}</Badge> : null}
            {api.access === "linked" ? <Badge variant="outline">{t("item.linkedOnly")}</Badge> : null}
          </p>
          {api.name !== api.identifier ? (
            <p className="break-all font-mono text-xs text-muted-foreground">{api.identifier}</p>
          ) : null}
          {api.scopes.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {api.scopes.map((scope) => (
                <Badge key={scope} variant="secondary" className="font-mono font-normal">
                  {scope}
                </Badge>
              ))}
            </div>
          ) : api.authServer ? (
            <p className="text-xs text-muted-foreground">{t("item.noResourceParam")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("item.noScopes")}</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t("item.editAria", { name: api.name })} onClick={() => setDialog("edit")}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          {api.fromEnv ? null : (
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t("item.deleteAria", { name: api.name })} onClick={() => setDialog("delete")}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-3 grid gap-2 border-t border-border/60 pt-3 text-xs sm:grid-cols-[auto_1fr_auto] sm:items-baseline sm:gap-x-3">
        <dt className="font-medium text-foreground">{t("item.applications")}</dt>
        <dd className="min-w-0 text-muted-foreground">
          {api.access === "all" ? (
            t("item.everyApplication")
          ) : linkedNames.length > 0 ? (
            <span className="break-words">{t("item.onlyLinked", { names: linkedNames.join(", ") })}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              {t("item.noneLinked")}
            </span>
          )}
        </dd>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="justify-self-start"
          aria-label={t("item.changeAccessAria", { name: api.name })}
          onClick={() => setDialog("access")}
        >
          {t("item.change")}
        </Button>
        <dt className="font-medium text-foreground">{t("item.tokens")}</dt>
        <dd className="min-w-0 break-words text-muted-foreground">{tokens.length > 0 ? tokens.join(" · ") : t("item.defaultSettings")}</dd>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="justify-self-start"
          aria-label={t("item.changeTokensAria", { name: api.name })}
          onClick={() => setDialog("tokens")}
        >
          {t("item.change")}
        </Button>
      </dl>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && !busy && closeDialog()}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          {dialog === "edit" ? (
            <ApiEditDialogBody {...dialogProps} />
          ) : dialog === "access" ? (
            <ApiAccessDialogBody {...dialogProps} applications={applications} />
          ) : dialog === "tokens" ? (
            <ApiTokensDialogBody {...dialogProps} />
          ) : dialog === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("delete.title", { name: api.name })}</DialogTitle>
                <DialogDescription>
                  {t("delete.description")}
                </DialogDescription>
              </DialogHeader>
              <DialogActions
                busy={busy}
                onCancel={closeDialog}
                onConfirm={() => void run(() => deleteApi(api.identifier), t("delete.deleted"))}
                confirmLabel={tc("delete")}
                destructive
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}
