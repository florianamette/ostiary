"use client";

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { authClient } from "@/lib/auth-client";

import { OverviewStatCard } from "./overview-stat-card";
import type { OverviewStatDefinition } from "./types";

async function fetchTotal(
  query: Record<string, string | number | boolean>
): Promise<number | null> {
  const res = await authClient.admin.listUsers({ query });
  if (res.error) return null;
  const t = res.data?.total;
  return typeof t === "number" ? t : null;
}

export function OverviewStatsSection({ refreshKey }: { refreshKey: number }) {
  const t = useTranslations("admin.pages.overview.stats");
  const format = useFormatter();
  const [stats, setStats] = React.useState<OverviewStatDefinition[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const [
        total,
        admins,
        banned,
        verified,
        recent,
      ] = await Promise.all([
        fetchTotal({ limit: 1, offset: 0 }),
        fetchTotal({
          limit: 1,
          offset: 0,
          filterField: "role",
          filterOperator: "eq",
          filterValue: "admin",
        }),
        fetchTotal({
          limit: 1,
          offset: 0,
          filterField: "banned",
          filterOperator: "eq",
          filterValue: true,
        }),
        fetchTotal({
          limit: 1,
          offset: 0,
          filterField: "emailVerified",
          filterOperator: "eq",
          filterValue: true,
        }),
        fetchTotal({
          limit: 1,
          offset: 0,
          filterField: "createdAt",
          filterOperator: "gte",
          filterValue: since,
        }),
      ]);

      if (cancelled) return;

      if (
        total === null ||
        admins === null ||
        banned === null ||
        verified === null ||
        recent === null
      ) {
        setError(t("error"));
        setStats([]);
        setLoading(false);
        return;
      }

      const counts = { totalUsers: total, admins, banned, verified, recent };
      const next: OverviewStatDefinition[] = (
        Object.keys(counts) as (keyof typeof counts)[]
      ).map((key) => ({
        title: t(`${key}.title`),
        value: format.number(counts[key], { maximumFractionDigits: 0 }),
        hint: t(`${key}.hint`),
      }));

      setStats(next);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, t, format]);

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <OverviewStatCard
                key={i}
                stat={{
                  title: t("loadingTitle"),
                  value: "…",
                  hint: t("loadingHint"),
                }}
              />
            ))
          : stats.map((stat) => (
              <OverviewStatCard key={stat.title} stat={stat} />
            ))}
      </div>
    </div>
  );
}
