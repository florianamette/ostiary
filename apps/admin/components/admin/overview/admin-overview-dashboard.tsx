"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdminOverviewRecentUsers } from "./admin-overview-recent-users";
import { OverviewStatsSection } from "./overview-stats-section";
import { Button } from "@ostiary/core/components/ui/button";

export function AdminOverviewDashboard() {
  const tc = useTranslations("admin.common");
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RefreshCwIcon />
          {tc("refresh")}
        </Button>
      </div>
      <OverviewStatsSection refreshKey={refreshKey} />
      <AdminOverviewRecentUsers refreshKey={refreshKey} />
    </div>
  );
}
