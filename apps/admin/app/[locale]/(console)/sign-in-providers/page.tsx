import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { AdminSignInProvidersPanel } from "@/components/admin/sign-in-providers/admin-sign-in-providers-panel";
import { db } from "@ostiary/core/db/index";
import { account } from "@ostiary/core/db/schema";
import { brand } from "@ostiary/core/lib/brand";
import { env } from "@ostiary/core/lib/env";
import { listSocialProviderSettings } from "@ostiary/core/lib/social-providers";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.signInProviders" });
  return { title: t("title"), description: t("description", { name: brand.name }) };
}

export default async function AdminSignInProvidersPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.signInProviders" });
  const [providers, linked] = await Promise.all([
    listSocialProviderSettings(),
    db
      .select({ providerId: account.providerId, count: sql<number>`count(*)::int` })
      .from(account)
      .groupBy(account.providerId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description", { name: brand.name })} />
      <AdminSignInProvidersPanel
        authAppUrl={env.AUTH_APP_URL ?? ""}
        providers={providers.map((p) => ({
          ...p,
          updatedAt: p.updatedAt?.toISOString() ?? null,
          linkedAccounts: linked.find((l) => l.providerId === p.id)?.count ?? 0,
        }))}
      />
    </div>
  );
}
