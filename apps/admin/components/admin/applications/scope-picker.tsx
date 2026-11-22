"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Field, FieldLabel } from "@ostiary/core/components/ui/field";
import { Label } from "@ostiary/core/components/ui/label";

/** The scopes an application may be limited to: the sign-in scopes, then the APIs' scopes. */
export type ScopeOptions = {
  /** openid, profile, email, offline_access. */
  oidcScopes: string[];
  apis: { identifier: string; name: string; scopes: string[] }[];
  /** API scopes no API declares (OAUTH_API_SCOPES). */
  otherScopes: string[];
};

export const EMPTY_SCOPE_OPTIONS: ScopeOptions = { oidcScopes: [], apis: [], otherScopes: [] };

/** The options of the Applications page, for the dialogs its rows open. */
export const ScopeOptionsContext = React.createContext<ScopeOptions>(EMPTY_SCOPE_OPTIONS);

/** One scope checkbox. */
function ScopeCheckbox({
  id,
  scope,
  checked,
  onChange,
}: {
  id: string;
  scope: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        className="size-4 shrink-0 rounded border-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Label htmlFor={id} className="cursor-pointer font-mono text-xs font-normal">
        {scope}
      </Label>
    </div>
  );
}

/** `selected` with `scope` added or removed. */
export function toggleScope(selected: ReadonlySet<string>, scope: string, checked: boolean) {
  const next = new Set(selected);
  if (checked) next.add(scope);
  else next.delete(scope);
  return next;
}

/**
 * Picks scopes grouped by API, with the sign-in scopes first unless `apiOnly` (a
 * machine-to-machine client, which signs no user in).
 */
export function ScopePickerField({
  idPrefix,
  options,
  apiOnly,
  selected,
  onToggle,
  label,
  hint,
}: {
  idPrefix: string;
  options: ScopeOptions;
  apiOnly: boolean;
  selected: ReadonlySet<string>;
  onToggle: (scope: string, checked: boolean) => void;
  label: React.ReactNode;
  hint: React.ReactNode;
}) {
  const t = useTranslations("admin.pages.applications.register");
  const groups = [
    ...(apiOnly || options.oidcScopes.length === 0
      ? []
      : [{ key: "oidc", name: t("signInScopes"), detail: null, scopes: options.oidcScopes }]),
    ...options.apis.map((api) => ({ key: api.identifier, name: api.name, detail: api.identifier, scopes: api.scopes })),
    ...(options.otherScopes.length
      ? [{ key: "other", name: t("otherScopes"), detail: null, scopes: options.otherScopes }]
      : []),
  ];
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noApiScopes")}</p>
      ) : (
        <div className="grid max-h-48 gap-2 overflow-y-auto">
          {groups.map((group, index) => (
            <fieldset key={group.key} className="grid gap-2 rounded-md border border-border/80 bg-muted/30 p-3">
              <legend className="sr-only">{group.name}</legend>
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{group.name}</span>
                {group.detail ? (
                  <code className="text-muted-foreground truncate font-mono text-xs">{group.detail}</code>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {group.scopes.map((scope) => (
                  <ScopeCheckbox
                    key={scope}
                    id={`${idPrefix}-${index}-${scope}`}
                    scope={scope}
                    checked={selected.has(scope)}
                    onChange={(checked) => onToggle(scope, checked)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">{hint}</p>
    </Field>
  );
}

/**
 * The picked scopes as a scope string (in the options' order), and the APIs whose scopes are
 * picked: a machine-to-machine client is linked to them.
 */
export function scopeRequest(options: ScopeOptions, selected: ReadonlySet<string>) {
  const all = [...options.oidcScopes, ...options.apis.flatMap((api) => api.scopes), ...options.otherScopes];
  const scope = [...new Set(all)].filter((s) => selected.has(s)).join(" ");
  const resources = options.apis
    .filter((api) => api.scopes.some((s) => selected.has(s)))
    .map((api) => api.identifier);
  return { scope, resources };
}
