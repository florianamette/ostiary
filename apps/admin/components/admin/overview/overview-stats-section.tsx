import { useFormatter, useTranslations } from "next-intl";

import type { OverviewCounts } from "@/lib/overview-stats";

import { OverviewStatCard } from "./overview-stat-card";

const STATS = ["totalUsers", "admins", "banned", "verified", "recent"] as const;

/** The overview's account counts. Without `counts`, placeholders while they load. */
export function OverviewStatsSection({ counts }: { counts?: OverviewCounts }) {
  const t = useTranslations("admin.pages.overview.stats");
  const format = useFormatter();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-busy={!counts}>
      {STATS.map((key) => (
        <OverviewStatCard
          key={key}
          stat={{
            title: t(`${key}.title`),
            value: counts ? format.number(counts[key], { maximumFractionDigits: 0 }) : "…",
            hint: t(`${key}.hint`),
          }}
        />
      ))}
    </div>
  );
}
