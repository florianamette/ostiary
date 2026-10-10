"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@ostiary/core/components/ui/badge";
import { DialogDescription, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  RESERVED_CLAIMS,
  type ApiAccess,
} from "@ostiary/core/lib/oauth-resource-policy";
import { setApiAccess, updateApi, updateApiTokens } from "@/app/[locale]/(console)/apis/actions";
import type { ApiRow, ApplicationOption } from "@/components/admin/apis/admin-apis-panel";
import { CheckboxField, RadioField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import type { ActionResult } from "@/components/admin/common/use-admin-action";

const CLAIMS_PLACEHOLDER = '{\n  "tenant": "acme"\n}';

/**
 * What the API's dialogs share. Each body is mounted when its dialog opens, so its fields start
 * from the API's current settings.
 */
type ApiDialogBodyProps = {
  api: ApiRow;
  busy: boolean;
  run: (action: () => Promise<ActionResult>, success: string) => Promise<void>;
  onCancel: () => void;
};

export function ApiEditDialogBody({ api, busy, run, onCancel }: ApiDialogBodyProps) {
  const t = useTranslations("admin.pages.apis");
  const tc = useTranslations("admin.common");
  const [name, setName] = React.useState(api.name);
  const [scopes, setScopes] = React.useState(api.scopes.join(" "));
  const [restrict, setRestrict] = React.useState(api.restrict);
  const [disabled, setDisabled] = React.useState(api.disabled);
  const id = encodeURIComponent(api.identifier);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("edit.title", { name: api.name })}</DialogTitle>
        <DialogDescription className="break-all">{api.identifier}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`name-${id}`}>{tc("name")}</FieldLabel>
          <Input id={`name-${id}`} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`scopes-${id}`}>{t("register.scopes")}</FieldLabel>
          <Input id={`scopes-${id}`} value={scopes} onChange={(e) => setScopes(e.target.value)} disabled={busy} />
          <FieldDescription>{t("edit.scopesHint")}</FieldDescription>
        </Field>
        <Field>
          <CheckboxField
            id={`restrict-${id}`}
            checked={restrict}
            onChange={setRestrict}
            disabled={busy}
            label={t("restrictLabel")}
            hint={t("restrictHint")}
          />
        </Field>
        {api.authServer ? null : (
          <Field>
            <CheckboxField
              id={`disabled-${id}`}
              checked={disabled}
              onChange={setDisabled}
              disabled={busy}
              label={tc("disabled")}
              hint={t("edit.disabledHint")}
            />
          </Field>
        )}
      </FieldGroup>
      <DialogActions
        busy={busy}
        onCancel={onCancel}
        onConfirm={() => void run(() => updateApi(api.identifier, { name, scopes, restrict, disabled }), t("edit.updated"))}
        confirmLabel={tc("save")}
      />
    </>
  );
}

export function ApiAccessDialogBody({
  api,
  applications,
  busy,
  run,
  onCancel,
}: ApiDialogBodyProps & { applications: ApplicationOption[] }) {
  const t = useTranslations("admin.pages.apis");
  const tc = useTranslations("admin.common");
  const [access, setAccess] = React.useState<ApiAccess>(api.access);
  const [linked, setLinked] = React.useState<Set<string>>(() => new Set(api.linkedClientIds));
  const [appFilter, setAppFilter] = React.useState("");
  const id = encodeURIComponent(api.identifier);

  const filter = appFilter.trim().toLowerCase();
  const shownApplications = filter
    ? applications.filter((app) => app.name.toLowerCase().includes(filter) || app.clientId.toLowerCase().includes(filter))
    : applications;

  function toggleLinked(clientId: string, checked: boolean) {
    setLinked((current) => {
      const next = new Set(current);
      if (checked) next.add(clientId);
      else next.delete(clientId);
      return next;
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("access.title", { name: api.name })}</DialogTitle>
        <DialogDescription className="break-all">{api.identifier}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <RadioField
            id={`access-all-${id}`}
            name={`access-${id}`}
            checked={access === "all"}
            onChange={() => setAccess("all")}
            disabled={busy}
            label={t("item.everyApplication")}
            hint={t("access.allHint")}
          />
          {api.authServer ? null : (
            <RadioField
              id={`access-linked-${id}`}
              name={`access-${id}`}
              checked={access === "linked"}
              onChange={() => setAccess("linked")}
              disabled={busy}
              label={t("access.linkedLabel")}
              hint={t("access.linkedHint", { error: "invalid_target" })}
            />
          )}
        </Field>
        <Field>
          <FieldTitle>{t("access.linkedTitle")}</FieldTitle>
          {applications.length > 6 ? (
            <Input
              type="search"
              aria-label={t("access.filterAria")}
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              disabled={busy}
              placeholder={t("access.filterPlaceholder")}
            />
          ) : null}
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("access.noApplications")}</p>
          ) : (
            <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/80">
              {shownApplications.map((app) => {
                const checkboxId = `link-${id}-${encodeURIComponent(app.clientId)}`;
                return (
                  <li key={app.clientId} className="flex items-center gap-3 px-3 py-2">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      className="size-4 shrink-0 rounded border-input"
                      checked={linked.has(app.clientId)}
                      disabled={busy}
                      onChange={(e) => toggleLinked(app.clientId, e.target.checked)}
                    />
                    <Label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm">
                        {app.name}
                        {app.disabled ? <Badge variant="destructive">{tc("disabled")}</Badge> : null}
                      </span>
                      <span className="block max-w-full truncate font-mono text-xs text-muted-foreground">{app.clientId}</span>
                    </Label>
                  </li>
                );
              })}
              {shownApplications.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">{t("access.noMatch")}</li>
              ) : null}
            </ul>
          )}
          <FieldDescription>
            {access === "all"
              ? t("access.linksHintAll")
              : t("access.linksHintLinked")}
          </FieldDescription>
          {access === "linked" && linked.size === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              {t("access.noneLinkedWarning")}
            </p>
          ) : null}
        </Field>
      </FieldGroup>
      <DialogActions
        busy={busy}
        onCancel={onCancel}
        onConfirm={() => void run(() => setApiAccess(api.identifier, { access, clientIds: [...linked] }), t("access.updated"))}
        confirmLabel={tc("save")}
      />
    </>
  );
}

export function ApiTokensDialogBody({ api, busy, run, onCancel }: ApiDialogBodyProps) {
  const t = useTranslations("admin.pages.apis");
  const tc = useTranslations("admin.common");
  const [accessMinutes, setAccessMinutes] = React.useState(
    api.tokens.accessTokenTtl !== null ? String(api.tokens.accessTokenTtl / 60) : "",
  );
  const [refreshDays, setRefreshDays] = React.useState(
    api.tokens.refreshTokenTtl !== null ? String(api.tokens.refreshTokenTtl / 86_400) : "",
  );
  const [claims, setClaims] = React.useState(
    api.tokens.customClaims ? JSON.stringify(api.tokens.customClaims, null, 2) : "",
  );
  const [dpop, setDpop] = React.useState(api.tokens.dpopBoundAccessTokensRequired);
  const id = encodeURIComponent(api.identifier);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("tokens.title", { name: api.name })}</DialogTitle>
        <DialogDescription>
          {t("tokens.description")}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`access-ttl-${id}`}>{t("tokens.accessTtl")}</FieldLabel>
            <Input
              id={`access-ttl-${id}`}
              type="number"
              inputMode="decimal"
              min={1}
              max={ACCESS_TOKEN_EXPIRES_IN / 60}
              step="any"
              value={accessMinutes}
              onChange={(e) => setAccessMinutes(e.target.value)}
              disabled={busy}
              placeholder={String(ACCESS_TOKEN_EXPIRES_IN / 60)}
            />
            <FieldDescription>{t("tokens.accessTtlHint", { minutes: ACCESS_TOKEN_EXPIRES_IN / 60 })}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`refresh-ttl-${id}`}>{t("tokens.refreshTtl")}</FieldLabel>
            <Input
              id={`refresh-ttl-${id}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={REFRESH_TOKEN_EXPIRES_IN / 86_400}
              step="any"
              value={refreshDays}
              onChange={(e) => setRefreshDays(e.target.value)}
              disabled={busy}
              placeholder={String(REFRESH_TOKEN_EXPIRES_IN / 86_400)}
            />
            <FieldDescription>{t("tokens.refreshTtlHint", { days: REFRESH_TOKEN_EXPIRES_IN / 86_400 })}</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`claims-${id}`}>{t("tokens.claims")}</FieldLabel>
          <Textarea
            id={`claims-${id}`}
            className="min-h-24 font-mono text-xs"
            value={claims}
            onChange={(e) => setClaims(e.target.value)}
            disabled={busy}
            placeholder={CLAIMS_PLACEHOLDER}
            spellCheck={false}
          />
          <FieldDescription>
            {t.rich("tokens.claimsHint", {
              claims: RESERVED_CLAIMS.join(", "),
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </FieldDescription>
        </Field>
        <Field>
          <CheckboxField
            id={`dpop-${id}`}
            checked={dpop}
            onChange={setDpop}
            disabled={busy}
            label={t("tokens.dpopLabel")}
            hint={t("tokens.dpopHint")}
          />
        </Field>
      </FieldGroup>
      <DialogActions
        busy={busy}
        onCancel={onCancel}
        onConfirm={() =>
          void run(
            () =>
              updateApiTokens(api.identifier, {
                accessTokenMinutes: accessMinutes,
                refreshTokenDays: refreshDays,
                customClaims: claims,
                dpopRequired: dpop,
              }),
            t("tokens.saved"),
          )
        }
        confirmLabel={tc("save")}
      />
    </>
  );
}
