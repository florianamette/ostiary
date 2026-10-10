"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ostiary/core/components/ui/tabs";
import { SamlRegisterForm } from "@/components/admin/sso/admin-saml";
import { OidcRegisterForm } from "@/components/admin/sso/oidc-register-form";
import type { Org } from "@/components/admin/sso/organization-select";
import { ProviderItem, type SsoProviderRow } from "@/components/admin/sso/sso-provider-item";

/**
 * Registers OIDC and SAML 2.0 identity providers and manages existing ones (domain
 * verification, edit, delete). The IdP must send people back to `callbackBase`, the auth app.
 */
export function AdminSsoPanel({
  callbackBase,
  providers,
  organizations,
}: {
  callbackBase: string;
  providers: SsoProviderRow[];
  organizations: Org[];
}) {
  const t = useTranslations("sso");
  const ts = useTranslations("sso.saml");
  const tp = useTranslations("sso.panel");
  const [protocol, setProtocol] = React.useState<"oidc" | "saml">("oidc");

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("registerTitle")}</CardTitle>
          <CardDescription>{protocol === "saml" ? ts("registerDescription") : t("registerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={protocol} onValueChange={(v) => setProtocol(v as "oidc" | "saml")}>
            <TabsList aria-label={ts("protocol")}>
              <TabsTrigger value="oidc">OIDC</TabsTrigger>
              <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
            </TabsList>
            <TabsContent value="saml" className="pt-2">
              <SamlRegisterForm authAppUrl={callbackBase} organizations={organizations} />
            </TabsContent>
            <TabsContent value="oidc" className="space-y-4 pt-2">
              <OidcRegisterForm callbackBase={callbackBase} organizations={organizations} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("providersTitle")}</CardTitle>
          <CardDescription>{tp("providersDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("providersEmpty")}</p>
          ) : (
            <ul className="space-y-3">
              {providers.map((p) => (
                <ProviderItem key={p.providerId} provider={p} organizations={organizations} authAppUrl={callbackBase} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
