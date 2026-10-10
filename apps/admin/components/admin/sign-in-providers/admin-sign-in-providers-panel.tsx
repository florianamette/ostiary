"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Search, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { SocialProviderIcon } from "@ostiary/core/components/brand/social-provider-icon";
import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Input } from "@ostiary/core/components/ui/input";
import { SOCIAL_PROVIDER_META, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";
import { reorderProviders } from "@/app/[locale]/(console)/sign-in-providers/actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";
import { ProviderDialog, StatusBadge } from "@/components/admin/sign-in-providers/provider-dialog";

export type SignInProviderRow = {
  id: SocialProvider;
  source: "environment" | "database" | null;
  enabled: boolean;
  position: number;
  allowSignUp: boolean;
  /** Google only: Google One Tap on the sign-in and sign-up pages. */
  oneTap: boolean;
  config: Record<string, string>;
  secretsSet: string[];
  secretsUnreadable: boolean;
  missing: string[];
  updatedAt: string | null;
  linkedAccounts: number;
};

/** Social sign-in providers: which ones the sign-in page offers, in which order, with which credentials. */
export function AdminSignInProvidersPanel({
  providers,
  authAppUrl,
}: {
  providers: SignInProviderRow[];
  authAppUrl: string;
}) {
  const t = useTranslations("admin.pages.signInProviders.panel");
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<SocialProvider | null>(null);
  const { busy, run } = useAdminAction();

  const active = providers
    .filter((p) => p.enabled)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const needle = query.trim().toLowerCase();
  const listed = providers.filter(
    (p) => !needle || p.id.includes(needle) || SOCIAL_PROVIDER_META[p.id].name.toLowerCase().includes(needle),
  );
  const current = editing ? providers.find((p) => p.id === editing) ?? null : null;

  function move(index: number, delta: number) {
    const ids = active.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    void run(() => reorderProviders(ids));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("activeTitle")}</CardTitle>
          <CardDescription>{t("activeDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("noneActive")}
            </p>
          ) : (
            <ol className="divide-y divide-border rounded-md border border-border">
              {active.map((row, index) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                  <SocialProviderIcon provider={row.id} name={SOCIAL_PROVIDER_META[row.id].name} className="size-5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.config.buttonName || SOCIAL_PROVIDER_META[row.id].name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.source === "environment" ? t("setByEnvironment") : null}
                      {row.source !== "environment" && !row.allowSignUp ? t("existingAccountsOnly") : null}
                      {row.source !== "environment" && row.allowSignUp ? t("connectedAccounts", { count: row.linkedAccounts }) : null}
                      {row.oneTap ? " · One Tap" : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={busy || index === 0}
                      aria-label={t("moveUp", { name: SOCIAL_PROVIDER_META[row.id].name })}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={busy || index === active.length - 1}
                      aria-label={t("moveDown", { name: SOCIAL_PROVIDER_META[row.id].name })}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t("edit", { name: SOCIAL_PROVIDER_META[row.id].name })}
                      onClick={() => setEditing(row.id)}
                    >
                      <Settings2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("providersTitle")}</CardTitle>
          <CardDescription>{t("providersDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="pl-8"
            />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {listed.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setEditing(row.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-border/80 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <SocialProviderIcon provider={row.id} name={SOCIAL_PROVIDER_META[row.id].name} className="size-5" />
                  <span className="min-w-0 flex-1 truncate font-medium">{SOCIAL_PROVIDER_META[row.id].name}</span>
                  <StatusBadge row={row} />
                </button>
              </li>
            ))}
          </ul>
          {listed.length === 0 ? <p className="text-sm text-muted-foreground">{t("noMatch")}</p> : null}
        </CardContent>
      </Card>

      <ProviderDialog
        key={current?.id ?? "none"}
        row={current}
        authAppUrl={authAppUrl}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
