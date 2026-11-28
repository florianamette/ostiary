import { getTranslations } from "next-intl/server";

import { DashboardApiKeysSection } from "@/components/dashboard/dashboard-api-keys-section";
import { redirect } from "@/i18n/navigation";
import { getMyApiKeys } from "@/lib/api-keys-actions";
import { getDashboardContext } from "@/lib/dashboard-context";

export default async function DashboardApiKeysPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { showApiKeys } = await getDashboardContext();
  // API keys are off and the person has none: the tab is hidden.
  if (!showApiKeys) return redirect({ href: "/dashboard", locale });
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const keys = await getMyApiKeys().catch(() => null);
  return (
    <>
      <h1 className="sr-only">{t("nav.apiKeys")}</h1>
      <DashboardApiKeysSection initialKeys={keys} />
    </>
  );
}
