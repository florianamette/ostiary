"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  buildClientClaims,
  CLAIM_ATTRIBUTES,
  CLAIM_TOKENS,
  CLIENT_CLAIMS_LIMITS,
  EXAMPLE_CLAIM_CONTEXT,
  MACHINE_CLAIM_CONTEXT,
  validateClientClaims,
  type ClaimAttribute,
  type ClaimToken,
  type ClientClaim,
} from "@ostiary/core/lib/client-claims/policy";
import {
  loadClientClaims,
  saveClientClaimsAction,
  type ClaimsDialogData,
} from "@/app/[locale]/(console)/applications/claims-actions";

type ValueKind = "text" | "json" | "attribute";

/** One claim as edited: the value is kept as typed until it is saved. */
type ClaimRow = {
  key: number;
  name: string;
  kind: ValueKind;
  text: string;
  json: string;
  attribute: ClaimAttribute;
  tokens: ClaimToken[];
};

let nextKey = 0;

function newRow(): ClaimRow {
  return { key: ++nextKey, name: "", kind: "text", text: "", json: "", attribute: "user.role", tokens: ["id_token", "access_token"] };
}

function toRow(claim: ClientClaim): ClaimRow {
  const row = { ...newRow(), name: claim.name, tokens: claim.tokens };
  if (claim.source === "attribute") return { ...row, kind: "attribute", attribute: claim.attribute };
  if (typeof claim.value === "string") return { ...row, kind: "text", text: claim.value };
  return { ...row, kind: "json", json: JSON.stringify(claim.value) };
}

/** The rows as claims, or the name of the first row whose JSON does not parse. */
function toClaims(rows: ClaimRow[]): { ok: true; claims: ClientClaim[] } | { ok: false; jsonInvalid: string } {
  const claims: ClientClaim[] = [];
  for (const row of rows) {
    const base = { name: row.name.trim(), tokens: row.tokens };
    if (row.kind === "attribute") claims.push({ ...base, source: "attribute", attribute: row.attribute });
    else if (row.kind === "text") claims.push({ ...base, source: "static", value: row.text });
    else {
      try {
        claims.push({ ...base, source: "static", value: JSON.parse(row.json) as never });
      } catch {
        return { ok: false, jsonInvalid: base.name || "?" };
      }
    }
  }
  return { ok: true, claims };
}

const TOKEN_LABEL: Record<ClaimToken, "tokenId" | "tokenAccess" | "tokenUserinfo"> = {
  id_token: "tokenId",
  access_token: "tokenAccess",
  userinfo: "tokenUserinfo",
};

/** The attribute's message key (next-intl reads dots as nesting). */
function attributeKey(attribute: ClaimAttribute) {
  return `attributes.${attribute.replaceAll(".", "_")}` as "attributes.user_role";
}

export function ClientClaimsDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.pages.applications.claims");
  const tErrors = useTranslations("admin.pages.applications.claimsErrors");
  const tCommon = useTranslations("admin.common");
  const [data, setData] = React.useState<ClaimsDialogData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ClaimRow[] | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setRows(null);
    setLoadError(null);
    setError(null);
    void loadClientClaims(clientId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setData(result.data);
      setRows(result.data.claims.map(toRow));
    });
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const update = (key: number, patch: Partial<ClaimRow>) =>
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? current);

  // The same checks as the server, for the preview and before saving.
  const checked = React.useMemo(() => {
    if (!rows) return null;
    const claims = toClaims(rows);
    if (!claims.ok) return { ok: false as const, error: t("jsonInvalid", { name: claims.jsonInvalid }) };
    const valid = validateClientClaims(claims.claims);
    if (!valid.ok) return { ok: false as const, error: tErrors(valid.issue.code, valid.issue.values) };
    return { ok: true as const, claims: valid.value };
  }, [rows, t, tErrors]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!rows) return;
    setError(null);
    const claims = toClaims(rows);
    if (!claims.ok) {
      setError(t("jsonInvalid", { name: claims.jsonInvalid }));
      return;
    }
    setPending(true);
    try {
      // Sent even when the preview shows an error: the server checks again and answers with it.
      const result = await saveClientClaimsAction(clientId, claims.claims);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(t("saved"));
      onOpenChange(false);
    } catch {
      setError(tCommon("unexpectedError"));
    } finally {
      setPending(false);
    }
  }

  const id = (name: string, key: number) => `claims-${name}-${key}`;
  const previews: { label: string; token: ClaimToken; machine?: boolean }[] = [
    { label: t("tokenId"), token: "id_token" },
    { label: t("tokenAccess"), token: "access_token" },
    { label: t("tokenUserinfo"), token: "userinfo" },
    { label: t("previewMachine"), token: "access_token", machine: true },
  ];
  const example = EXAMPLE_CLAIM_CONTEXT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t.rich("description", {
              client: data?.clientName ?? clientId,
              app: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-destructive text-sm" role="alert">
            {loadError}
          </p>
        ) : !rows || !data ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden /> {tCommon("loading")}
          </div>
        ) : (
          <form onSubmit={(e) => void save(e)} className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {rows.length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
              {rows.map((row, index) => (
                <fieldset key={row.key} className="space-y-3 rounded-md border border-border/80 bg-muted/30 p-3">
                  <legend className="sr-only">{t("claimNumber", { number: index + 1 })}</legend>
                  <div className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1.5">
                      <Label htmlFor={id("name", row.key)}>{t("name")}</Label>
                      <Input
                        id={id("name", row.key)}
                        value={row.name}
                        maxLength={CLIENT_CLAIMS_LIMITS.maxNameLength}
                        placeholder="https://example.com/tenant"
                        autoComplete="off"
                        spellCheck={false}
                        className="font-mono text-xs"
                        onChange={(e) => update(row.key, { name: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove", { number: index + 1 })}
                      onClick={() => setRows((current) => current?.filter((r) => r.key !== row.key) ?? current)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <div className="grid gap-1.5">
                      <Label htmlFor={id("kind", row.key)}>{t("source")}</Label>
                      <Select value={row.kind} onValueChange={(kind) => update(row.key, { kind: kind as ValueKind })}>
                        <SelectTrigger id={id("kind", row.key)} aria-label={t("source")} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{t("sourceText")}</SelectItem>
                          <SelectItem value="json">{t("sourceJson")}</SelectItem>
                          <SelectItem value="attribute">{t("sourceAttribute")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={id("value", row.key)}>{row.kind === "attribute" ? t("attribute") : t("value")}</Label>
                      {row.kind === "attribute" ? (
                        <Select value={row.attribute} onValueChange={(attribute) => update(row.key, { attribute: attribute as ClaimAttribute })}>
                          <SelectTrigger id={id("value", row.key)} aria-label={t("attribute")} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLAIM_ATTRIBUTES.map((attribute) => (
                              <SelectItem key={attribute} value={attribute}>
                                {t(attributeKey(attribute))} <code className="text-muted-foreground text-xs">{attribute}</code>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : row.kind === "text" ? (
                        <Input
                          id={id("value", row.key)}
                          value={row.text}
                          placeholder="acme"
                          onChange={(e) => update(row.key, { text: e.target.value })}
                        />
                      ) : (
                        <Textarea
                          id={id("value", row.key)}
                          rows={2}
                          value={row.json}
                          placeholder='["sso", "audit"]'
                          spellCheck={false}
                          className="font-mono text-xs"
                          onChange={(e) => update(row.key, { json: e.target.value })}
                        />
                      )}
                    </div>
                  </div>
                  <div role="group" aria-label={t("tokens")} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="text-muted-foreground text-xs">{t("tokens")}</span>
                    {CLAIM_TOKENS.map((token) => (
                      <label key={token} className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={row.tokens.includes(token)}
                          onChange={(e) =>
                            update(row.key, {
                              tokens: e.target.checked ? [...row.tokens, token] : row.tokens.filter((x) => x !== token),
                            })
                          }
                        />
                        {t(TOKEN_LABEL[token])}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length >= CLIENT_CLAIMS_LIMITS.maxClaims}
                onClick={() => setRows((current) => [...(current ?? []), newRow()])}
              >
                <PlusIcon /> {t("add")}
              </Button>
              <div className="space-y-1 text-muted-foreground text-xs">
                <p>{t("nameHint")}</p>
                <p>{t("limits", { max: CLIENT_CLAIMS_LIMITS.maxClaims, kilobytes: CLIENT_CLAIMS_LIMITS.maxBytes / 1024 })}</p>
                <p>{t("precedence")}</p>
              </div>
            </div>

            <div className="space-y-3 md:sticky md:top-0 md:self-start">
              <div>
                <p className="text-sm font-medium">{t("previewTitle")}</p>
                <p className="text-muted-foreground text-xs">
                  {t("previewHint", {
                    username: example.user?.username ?? "",
                    role: example.user?.role ?? "",
                    organization: example.organization?.slug ?? "",
                  })}
                </p>
              </div>
              {checked && !checked.ok ? (
                <p className="text-destructive text-sm" role="alert" data-testid="claims-preview-error">
                  {checked.error}
                </p>
              ) : (
                previews.map(({ label, token, machine }) => {
                  const claims = checked?.ok ? buildClientClaims(checked.claims, token, machine ? MACHINE_CLAIM_CONTEXT : example) : {};
                  return (
                    <div key={label} className="space-y-1">
                      <p className="text-xs font-medium">{label}</p>
                      <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
                        {Object.keys(claims).length ? JSON.stringify(claims, null, 2) : t("previewEmpty")}
                      </pre>
                    </div>
                  );
                })
              )}
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? tCommon("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
