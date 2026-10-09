import { asc, eq } from "drizzle-orm";

import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { AdminSsoPanel } from "@/components/admin/sso/admin-sso-panel";
import { db } from "@ostiary/core/db/index";
import { organization, ssoProvider } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { samlServiceProviderUrls, summarizeSamlConfig } from "@ostiary/core/lib/saml";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export default async function AdminSsoPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sso" });
  const [providers, organizations] = await Promise.all([
    db
      .select({
        providerId: ssoProvider.providerId,
        issuer: ssoProvider.issuer,
        domain: ssoProvider.domain,
        domainVerified: ssoProvider.domainVerified,
        organizationId: ssoProvider.organizationId,
        organizationName: organization.name,
        samlConfig: ssoProvider.samlConfig,
      })
      .from(ssoProvider)
      .leftJoin(organization, eq(ssoProvider.organizationId, organization.id))
      .orderBy(asc(ssoProvider.providerId)),
    db.select({ id: organization.id, name: organization.name }).from(organization).orderBy(asc(organization.name)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <AdminSsoPanel
        callbackBase={env.AUTH_APP_URL ?? ""}
        providers={providers.map(({ samlConfig, ...p }) => {
          const saml = summarizeSamlConfig(samlConfig);
          return {
            ...p,
            domainVerified: Boolean(p.domainVerified),
            protocol: saml ? ("saml" as const) : ("oidc" as const),
            saml: saml ? { ...saml, sp: samlServiceProviderUrls(env.AUTH_APP_URL ?? "", p.providerId) } : null,
          };
        })}
        organizations={organizations.filter((o) => o.id !== PUBLIC_ORGANIZATION_ID)}
      />
    </div>
  );
}
