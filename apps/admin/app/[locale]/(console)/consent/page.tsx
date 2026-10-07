import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminConsentPanel } from "@/components/admin/consent/admin-consent-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.consent" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function AdminConsentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.consent" });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <AdminConsentPanel />
    </div>
  );
}
