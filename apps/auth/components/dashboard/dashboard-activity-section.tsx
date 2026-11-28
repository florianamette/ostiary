"use client";

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { useAsyncResource } from "@ostiary/core/hooks/use-async-resource";
import type { AccountActivityItem, AccountActivityPage } from "@ostiary/core/lib/account-activity";
import { describeUserAgent } from "@ostiary/core/lib/security/user-agent";
import { getMyActivity, signOutMySession } from "@/lib/account-activity-actions";
import { useAuthAction } from "@/lib/use-auth-action";

async function loadFirstPage(): Promise<AccountActivityPage> {
  const page = await getMyActivity(null);
  if (page === null) throw new Error("signed out");
  return page;
}

/** "Chrome on macOS · 203.0.113.9", whatever is known. */
function useWhere() {
  const t = useTranslations("dashboard.activity");
  return (item: AccountActivityItem) => {
    const { browser, system } = describeUserAgent(item.userAgent);
    const device = browser && system ? t("deviceOn", { browser, system }) : browser || system || (item.userAgent ? t("unknownDevice") : null);
    return [device, item.ipAddress].filter(Boolean).join(" · ");
  };
}

/** The person's own security history: sign-ins and account changes, last 30 days. */
export function DashboardActivitySection({ initialPage }: { initialPage: AccountActivityPage | null }) {
  const t = useTranslations("dashboard.activity");
  const format = useFormatter();
  const where = useWhere();
  const first = useAsyncResource(loadFirstPage, { initialData: initialPage ?? undefined });
  const [more, setMore] = React.useState<{ items: AccountActivityItem[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { pending, run } = useAuthAction<string>();

  const items = [...(first.data?.items ?? []), ...(more?.items ?? [])];
  const next = more ? more.next : (first.data?.next ?? null);

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await getMyActivity(next);
      if (page) setMore((m) => ({ items: [...(m?.items ?? []), ...page.items], next: page.next }));
    } finally {
      setLoadingMore(false);
    }
  }

  async function signOut(item: AccountActivityItem) {
    const sessionId = item.openSessionId;
    if (!sessionId) return;
    await run(item.id, {
      call: async () => {
        const { ok } = await signOutMySession(sessionId);
        return { error: ok ? null : {} };
      },
      success: t("signedOut"),
      error: t("signOutError"),
      onSuccess: () => {
        setMore(null);
        first.reload();
      },
    });
  }

  return (
    <Card id="activity" className="scroll-mt-32 border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {first.error && !first.data ? (
          <p className="text-sm text-destructive" role="alert">
            {t("loadError")}
          </p>
        ) : first.loading ? (
          <Skeleton className="h-20 w-full" aria-busy="true" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80" aria-label={t("title")}>
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm sm:flex-nowrap">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {t(`types.${item.type}`)}
                    {item.current ? <Badge variant="secondary">{t("current")}</Badge> : null}
                    {item.newDevice ? <Badge variant="outline">{t("newDevice")}</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={item.at}>{format.dateTime(new Date(item.at), { dateStyle: "medium", timeStyle: "short" })}</time>
                    {where(item) ? <span> · {where(item)}</span> : null}
                  </p>
                </div>
                {item.openSessionId && !item.current ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    loading={pending === item.id}
                    onClick={() => void signOut(item)}
                  >
                    {t("signOut")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {next ? (
          <Button type="button" variant="outline" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
            {t("more")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
