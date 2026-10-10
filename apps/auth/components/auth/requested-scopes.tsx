"use client";

import { useTranslations } from "next-intl";

/** The scopes an app asks for, each with its description when one is translated. */
export function RequestedScopes({ scopes, emptyText }: { scopes: string[]; emptyText: string }) {
  const t = useTranslations("consent");
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{t("requestedAccess")}</h3>
      {scopes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {scopes.map((scope) => (
            <li key={scope} className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <span className="font-mono text-xs text-foreground">{scope}</span>
              {t.has(`scopes.${scope}`) ? (
                <p className="mt-1 text-muted-foreground">{t(`scopes.${scope}`)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
