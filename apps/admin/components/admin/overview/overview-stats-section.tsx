"use client";

import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { authClient } from "@/lib/auth-client";

import { OverviewStatCard } from "./overview-stat-card";
import type { OverviewStatDefinition } from "./types";

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function fetchTotal(
  query: Record<string, string | number | boolean>
): Promise<number | null> {
  const res = await authClient.admin.listUsers({ query });
  if (res.error) return null;
  const t = res.data?.total;
  return typeof t === "number" ? t : null;
}

export function OverviewStatsSection({ refreshKey }: { refreshKey: number }) {
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
        setError(
          "Could not load one or more metrics. Ensure you are signed in as an admin."
        );
        setStats([]);
        setLoading(false);
        return;
      }

      const next: OverviewStatDefinition[] = [
        {
          title: "Total users",
          value: formatInt(total),
          hint: "Every account on the platform.",
        },
        {
          title: "Administrators",
          value: formatInt(admins),
          hint: "Accounts with access to this console.",
        },
        {
          title: "Banned",
          value: formatInt(banned),
          hint: "Accounts that can't sign in right now.",
        },
        {
          title: "Verified email",
          value: formatInt(verified),
          hint: "Accounts that confirmed their email address.",
        },
        {
          title: "New (7 days)",
          value: formatInt(recent),
          hint: "Accounts created in the last 7 days.",
        },
      ];

      setStats(next);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Metrics unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <OverviewStatCard
                key={i}
                stat={{
                  title: "Loading",
                  value: "…",
                  hint: "Loading…",
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
