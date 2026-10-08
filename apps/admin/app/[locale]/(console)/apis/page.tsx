import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { AdminApisPanel } from "@/components/admin/apis/admin-apis-panel";
import { db } from "@ostiary/core/db/index";
import { oauthResource } from "@ostiary/core/db/schema";
import { brand } from "@ostiary/core/lib/brand";
import { env } from "@ostiary/core/lib/env";
import { oauthResourceIdentifiers } from "@ostiary/core/lib/oauth-resources";
import { ENV_API_SCOPES, resourceScopes } from "@ostiary/core/lib/oauth-scopes";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.apis" });
  return { title: t("title"), description: t("description", { name: brand.name }) };
}

export default async function AdminApisPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.apis" });
  const rows = await db.select().from(oauthResource).orderBy(asc(oauthResource.createdAt));
  const authServer = env.AUTH_APP_URL ?? "";
  const fromEnv = new Set(oauthResourceIdentifiers(authServer));

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description", { name: brand.name })} />
      <AdminApisPanel
        envScopes={[...ENV_API_SCOPES]}
        apis={rows.map((row) => ({
          identifier: row.identifier,
          name: row.name,
          scopes: resourceScopes(row),
          restrict: row.allowedScopes !== null,
          disabled: Boolean(row.disabled),
          authServer: row.identifier === authServer,
          fromEnv: fromEnv.has(row.identifier),
        }))}
      />
    </div>
  );
}
