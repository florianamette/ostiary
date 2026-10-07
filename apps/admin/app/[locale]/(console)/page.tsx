import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminOverviewDashboard } from "@/components/admin/overview";
import { AuthActivityChart } from "@/components/admin/overview/auth-activity-chart";
import { getAuthActivity } from "@/lib/auth-activity";
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

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.overview" });
  await requireAdminSession();
  const activity = await getAuthActivity(30);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <AuthActivityChart data={activity} />
      <AdminOverviewDashboard />
    </div>
  );
}
