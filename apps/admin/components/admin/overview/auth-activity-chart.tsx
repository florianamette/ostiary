"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useLocale, useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@ostiary/core/components/ui/chart";
import type { AuthActivityDay } from "@/lib/auth-activity";

// Categorical slots 1-3, validated as a set for both modes (CVD and normal-vision separation).
const COLORS = {
  signIns: { light: "#2a78d6", dark: "#3987e5" },
  signUps: { light: "#eb6834", dark: "#d95926" },
  signOuts: { light: "#1baf7a", dark: "#199e70" },
} as const;

const SERIES = ["signIns", "signUps", "signOuts"] as const;

export function AuthActivityChart({ data }: { data: AuthActivityDay[] }) {
  const t = useTranslations("admin.pages.overview.activity");
  const locale = useLocale();
  const [showTable, setShowTable] = React.useState(false);

  const config = React.useMemo(
    () =>
      Object.fromEntries(
        SERIES.map((key) => [key, { label: t(key), theme: COLORS[key] }]),
      ) satisfies ChartConfig,
    [t],
  );

  const formatDay = React.useCallback(
    (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    [locale],
  );

  const totals = SERIES.map((key) => ({
    key,
    total: data.reduce((sum, d) => sum + d[key], 0),
  }));

  return (
    // Series colors as CSS variables on the whole card, so the legend swatches outside the
    // chart area use the same light/dark steps as the lines.
    <Card className="border-border/80 shadow-sm [--color-signIns:#2a78d6] [--color-signOuts:#1baf7a] [--color-signUps:#eb6834] dark:[--color-signIns:#3987e5] dark:[--color-signOuts:#199e70] dark:[--color-signUps:#d95926]">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
          >
            {showTable ? t("showChart") : t("showTable")}
          </button>
        </div>
        {/* Legend with 30-day totals: identity never relies on color alone. */}
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2" aria-label={t("legend")}>
          {totals.map(({ key, total }) => (
            <li key={key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: `var(--color-${key})` }}
              />
              <span className="text-sm text-muted-foreground">{t(key)}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {total.toLocaleString(locale)}
              </span>
            </li>
          ))}
        </ul>
      </CardHeader>
      <CardContent>
        {showTable ? (
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("day")}</th>
                  {SERIES.map((key) => (
                    <th key={key} className="px-3 py-2 text-right font-medium">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((d) => (
                  <tr key={d.date} className="border-t border-border/60">
                    <td className="px-3 py-1.5 text-muted-foreground">{formatDay(d.date)}</td>
                    {SERIES.map((key) => (
                      <td key={key} className="px-3 py-1.5 text-right tabular-nums">
                        {d[key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-64 w-full">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={formatDay}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
                tickMargin={4}
              />
              <ChartTooltip
                cursor={{ strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(value) => formatDay(String(value))}
                  />
                }
              />
              {SERIES.map((key) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="linear"
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("note")}</p>
      </CardContent>
    </Card>
  );
}
