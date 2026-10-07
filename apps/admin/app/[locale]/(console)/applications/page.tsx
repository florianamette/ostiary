import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { brand } from "@ostiary/core/lib/brand";

import { AdminApplicationsPanel } from "@/components/admin/applications/admin-applications-panel";
import { OAuthUsageCard } from "@/components/admin/applications/oauth-usage-card";
import { getOAuthClientUsage } from "@/lib/oauth-usage";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "admin.pages.applications",
  });
  return {
    title: t("title"),
    description: t("description", { name: brand.name }),
  };
}

export default async function AdminApplicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "admin.pages.applications",
  });

  await requireAdminSession();
  const usage = await getOAuthClientUsage();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("description", { name: brand.name })}
        </p>
      </div>
      <OAuthUsageCard usage={usage} locale={locale} />
      <AdminApplicationsPanel />
    </div>
  );
}
