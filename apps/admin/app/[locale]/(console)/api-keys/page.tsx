import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ApiKeySettingsCard } from "@/components/admin/api-keys/api-key-settings-card";
import { ApiKeysTable } from "@/components/admin/api-keys/api-keys-table";
import { PageHeader } from "@/components/admin/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { API_KEY_VERIFY_PATH, MAX_LIFETIME_DAYS_LIMIT } from "@ostiary/core/lib/api-key-policy";
import { apisAcceptingKeys, listAllApiKeys, loadApiKeySettings } from "@ostiary/core/lib/api-keys";
import { env } from "@ostiary/core/lib/env";
import { toAdminApiKeyRows } from "@/lib/api-key-rows";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 500;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.apiKeys" });
  return { title: t("title"), description: t("description") };
}

export default async function AdminApiKeysPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.apiKeys" });
  await requireAdminSession();

  const [settings, apis, keys] = await Promise.all([
    loadApiKeySettings(),
    apisAcceptingKeys(env.AUTH_APP_URL),
    listAllApiKeys(LIST_LIMIT),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <ApiKeySettingsCard
        settings={settings}
        apiNames={apis.map((api) => api.name)}
        verifyUrl={`${env.AUTH_APP_URL ?? ""}/api/auth${API_KEY_VERIFY_PATH}`}
        maxLifetimeLimit={MAX_LIFETIME_DAYS_LIMIT}
      />
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t("allKeys.title")}</CardTitle>
          <CardDescription>
            {t("allKeys.description", {
              truncated: keys.length >= LIST_LIMIT ? "true" : "false",
              limit: String(LIST_LIMIT),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeysTable rows={toAdminApiKeyRows(keys)} locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
