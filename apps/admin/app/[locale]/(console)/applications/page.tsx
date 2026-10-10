import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ArrowRightIcon, ActivityIcon } from "lucide-react";
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
import { countUnusedClients } from "@/components/admin/usage/oauth-usage-card";
import { Link } from "@/i18n/navigation";
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
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
  const unused = countUnusedClients(usage);
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
      {unused > 0 ? (
        <Link
          href="/usage"
          className="group flex items-center gap-3 rounded-lg border border-border/80 bg-muted/30 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
        >
          <ActivityIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-muted-foreground">{t("unusedHint", { count: unused })}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground">
            {t("viewUsage")}
            <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ) : null}
      <ClientRegistrationCard
        settings={registration}
        availableScopes={[...OIDC_SCOPES, ...apiScopes]}
        authServer={env.AUTH_APP_URL ?? ""}
      />
      <AdminApplicationsPanel
        initialSearch={typeof q === "string" ? q : ""}
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
          logoUri: client.icon,
          createdAt: (client.createdAt ?? new Date()).toISOString(),
          registration: client.source,
        }))}
      />
    </div>
  );
}
