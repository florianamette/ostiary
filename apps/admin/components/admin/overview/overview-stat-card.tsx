"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Badge } from "@ostiary/core/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { cn } from "@ostiary/core/lib/utils";

import type { OverviewStatDefinition } from "./types";

const TrendIcon = {
  up: ArrowUpRight,
  down: ArrowDownRight,
} as const;

export function OverviewStatCard({ stat }: { stat: OverviewStatDefinition }) {
  const showDelta = stat.delta != null && stat.delta !== "";
  const DeltaIcon =
    stat.positive === true ? ArrowUpRight : ArrowDownRight;
  const showTrend =
    stat.trend != null &&
    stat.trend !== "" &&
    stat.trendDirection != null;
  const FooterIcon = showTrend
    ? TrendIcon[stat.trendDirection!]
    : ArrowUpRight;

  return (
    <Card size="sm">
      <CardHeader className="border-0 pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {stat.title}
        </CardTitle>
        {showDelta ? (
          <CardAction>
            <Badge
              variant="outline"
              className={cn(
                "gap-0.5 px-1.5 font-medium tabular-nums",
                stat.positive
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400"
              )}
            >
              <DeltaIcon className="size-3" />
              {stat.delta}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="pb-2">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {stat.value}
        </p>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 border-t pt-4">
        {showTrend ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
            <FooterIcon className="size-3.5" />
            {stat.trend}
          </span>
        ) : null}
        <CardDescription className="text-xs">{stat.hint}</CardDescription>
      </CardFooter>
    </Card>
  );
}
