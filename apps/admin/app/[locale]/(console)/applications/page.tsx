import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { db } from "@ostiary/core/db/index";
import { oauthClientResource, oauthResource } from "@ostiary/core/db/schema";
import { brand } from "@ostiary/core/lib/brand";
import {
  listSelfRegisteredClients,
  loadClientRegistrationSettings,
} from "@ostiary/core/lib/client-registration";
import { env } from "@ostiary/core/lib/env";
import { currentApiScopes, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";

import { AdminApplicationsPanel } from "@/components/admin/applications/admin-applications-panel";
import { ClientRegistrationCard } from "@/components/admin/applications/client-registration-card";
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
  const [usage, links, registration, apiScopes, selfRegistered] = await Promise.all([
    getOAuthClientUsage(),
    db
      .select({ clientId: oauthClientResource.clientId, name: oauthResource.name })
      .from(oauthClientResource)
      .innerJoin(oauthResource, eq(oauthResource.identifier, oauthClientResource.resourceId))
      .orderBy(asc(oauthResource.name)),
    loadClientRegistrationSettings(),
    currentApiScopes(),
    listSelfRegisteredClients(),
  ]);
  // The APIs each application is linked to (managed from the APIs page).
  const linkedApis: Record<string, string[]> = {};
  for (const link of links) (linkedApis[link.clientId] ??= []).push(link.name);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("description", { name: brand.name })}
        </p>
      </div>
      <OAuthUsageCard usage={usage} locale={locale} />
      <ClientRegistrationCard
        settings={registration}
        availableScopes={[...OIDC_SCOPES, ...apiScopes]}
        authServer={env.AUTH_APP_URL ?? ""}
      />
      <AdminApplicationsPanel
        linkedApis={linkedApis}
        selfRegistered={selfRegistered.map((client) => ({
          clientId: client.clientId,
          name: client.name ?? client.clientId,
          public: client.tokenEndpointAuthMethod === "none",
          skipConsent: client.skipConsent,
          disabled: client.disabled,
          tokenEndpointAuthMethod:
            client.tokenEndpointAuthMethod === "none" || client.tokenEndpointAuthMethod === "client_secret_post"
              ? client.tokenEndpointAuthMethod
              : "client_secret_basic",
          grantTypes: client.grantTypes,
          redirectUris: client.redirectUris,
          createdAt: (client.createdAt ?? new Date()).toISOString(),
          registration: client.source,
        }))}
      />
    </div>
  );
}
