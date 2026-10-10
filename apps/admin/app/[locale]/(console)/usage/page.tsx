import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { StatTiles } from "@/components/admin/common/section";
import { countUnusedClients, OAuthUsageCard } from "@/components/admin/usage/oauth-usage-card";
import { getOAuthClientUsage } from "@/lib/oauth-usage";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.usage" });
  return { title: t("title"), description: t("description") };
}

/** Which applications are used: tokens, users and consents per client over 30 days. */
export default async function UsagePage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.usage" });
  const usage = await getOAuthClientUsage();
  const tokens = usage.reduce((sum, u) => sum + u.tokens30d, 0);
  const active = usage.filter((u) => u.tokens30d > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <StatTiles
        locale={locale}
        tiles={[
          { label: t("tiles.tokens"), value: tokens },
          { label: t("tiles.active"), value: active },
          { label: t("tiles.unused"), value: countUnusedClients(usage) },
        ]}
      />

      <OAuthUsageCard usage={usage} locale={locale} />
    </div>
  );
}
