import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { AdminApisPanel } from "@/components/admin/apis/admin-apis-panel";
import { db } from "@ostiary/core/db/index";
import { oauthClient, oauthClientResource, oauthResource } from "@ostiary/core/db/schema";
import { brand } from "@ostiary/core/lib/brand";
import { env } from "@ostiary/core/lib/env";
import { oauthResourceIdentifiers } from "@ostiary/core/lib/oauth-resources";
import { resourceAccess } from "@ostiary/core/lib/oauth-resource-policy";
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
  const [rows, clients, links] = await Promise.all([
    db.select().from(oauthResource).orderBy(asc(oauthResource.createdAt)),
    db
      .select({ clientId: oauthClient.clientId, name: oauthClient.name, disabled: oauthClient.disabled })
      .from(oauthClient)
      .orderBy(asc(oauthClient.name)),
    db.select({ clientId: oauthClientResource.clientId, resourceId: oauthClientResource.resourceId }).from(oauthClientResource),
  ]);
  const authServer = env.AUTH_APP_URL ?? "";
  const fromEnv = new Set(oauthResourceIdentifiers(authServer));

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description", { name: brand.name })} />
      <AdminApisPanel
        envScopes={[...ENV_API_SCOPES]}
        applications={clients.map((client) => ({
          clientId: client.clientId,
          name: client.name || client.clientId,
          disabled: Boolean(client.disabled),
        }))}
        apis={rows.map((row) => ({
          identifier: row.identifier,
          name: row.name,
          scopes: resourceScopes(row),
          restrict: row.allowedScopes !== null,
          disabled: Boolean(row.disabled),
          authServer: row.identifier === authServer,
          fromEnv: fromEnv.has(row.identifier),
          access: resourceAccess(row.metadata),
          linkedClientIds: links.filter((link) => link.resourceId === row.identifier).map((link) => link.clientId),
          tokens: {
            accessTokenTtl: row.accessTokenTtl,
            refreshTokenTtl: row.refreshTokenTtl,
            customClaims: (row.customClaims as Record<string, unknown> | null) ?? null,
            dpopBoundAccessTokensRequired: Boolean(row.dpopBoundAccessTokensRequired),
          },
        }))}
      />
    </div>
  );
}
