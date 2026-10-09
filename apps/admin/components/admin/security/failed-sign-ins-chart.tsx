"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useLocale, useTranslations } from "next-intl";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@ostiary/core/components/ui/chart";
import type { FailedDay } from "@/lib/security-stats";

// One series: categorical slot 1, stepped per mode. The card title names it, so no legend.
const THEME = { light: "#2a78d6", dark: "#3987e5" };

export function FailedSignInsChart({ data }: { data: FailedDay[] }) {
  const t = useTranslations("admin.pages.security.chart");
  const locale = useLocale();
  const config = React.useMemo(() => ({ failed: { label: t("failed"), theme: THEME } }) satisfies ChartConfig, [t]);
  const formatDay = React.useCallback(
    (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={formatDay} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tickMargin={4} />
        <ChartTooltip
          cursor={{ strokeWidth: 1 }}
          content={<ChartTooltipContent indicator="line" labelFormatter={(v) => formatDay(String(v))} />}
        />
        <Line
          dataKey="failed"
          type="linear"
          stroke="var(--color-failed)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
