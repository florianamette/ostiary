import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { AdminOverviewRecentUsers } from "@/components/admin/overview/admin-overview-recent-users";
import { AuthActivityChart } from "@/components/admin/overview/auth-activity-chart";
import { OverviewRefreshButton } from "@/components/admin/overview/overview-refresh-button";
import { OverviewStatsSection } from "@/components/admin/overview/overview-stats-section";
import { Card, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { getAuthActivity } from "@/lib/auth-activity";
import { getOverviewCounts, getRecentUsers } from "@/lib/overview-stats";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.overview" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * The header shows at once; the activity chart, the counts and the newest accounts stream in
 * as their queries finish.
 */
export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.overview" });
  await requireAdminSession();

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} actions={<OverviewRefreshButton />} />
      <Suspense fallback={<ActivityPlaceholder title={t("activity.title")} description={t("activity.description")} />}>
        <Activity />
      </Suspense>
      <Suspense fallback={<OverviewStatsSection />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<AdminOverviewRecentUsers />}>
        <RecentUsers />
      </Suspense>
    </div>
  );
}

async function Activity() {
  return <AuthActivityChart data={await getAuthActivity(30)} />;
}

async function Stats() {
  return <OverviewStatsSection counts={await getOverviewCounts()} />;
}

async function RecentUsers() {
  return <AdminOverviewRecentUsers rows={await getRecentUsers()} />;
}

function ActivityPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <Card aria-busy>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <div className="mx-6 mb-6 h-[260px] animate-pulse rounded-md bg-muted/50" />
    </Card>
  );
}
