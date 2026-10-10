"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import type { ApiAccess, TokenSettings } from "@ostiary/core/lib/oauth-resource-policy";
import { createApi } from "@/app/[locale]/(console)/apis/actions";
import { ApiItem } from "@/components/admin/apis/api-item";
import { CheckboxField } from "@/components/admin/common/choice-field";

export type ApiRow = {
  identifier: string;
  name: string;
  scopes: string[];
  restrict: boolean;
  disabled: boolean;
  /** The auth server's own resource: tokens issued without a `resource` parameter. */
  authServer: boolean;
  /** Listed in OAUTH_API_AUDIENCES: the build registers it again if deleted. */
  fromEnv: boolean;
  access: ApiAccess;
  /** Applications linked to the API (`oauth_client_resource`). */
  linkedClientIds: string[];
  tokens: TokenSettings;
};

export type ApplicationOption = { clientId: string; name: string; disabled: boolean };

/**
 * Registers APIs (OAuth protected resources) and the scopes clients may request for them.
 * New scopes reach the auth app within a minute, without a redeploy.
 */
export function AdminApisPanel({
  apis,
  applications,
  envScopes,
}: {
  apis: ApiRow[];
  applications: ApplicationOption[];
  envScopes: string[];
}) {
  const t = useTranslations("admin.pages.apis");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [identifier, setIdentifier] = React.useState("");
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState("");
  const [restrict, setRestrict] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await createApi({ identifier, name, scopes, restrict });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("register.registered"));
      setIdentifier("");
      setName("");
      setScopes("");
      setRestrict(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("register.title")}</CardTitle>
          <CardDescription>
            {t.rich("register.description", {
              param: "resource",
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="api-identifier">{t("register.identifier")}</FieldLabel>
                <Input
                  id="api-identifier"
                  type="url"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={submitting}
                  placeholder="https://api.example.com"
                  required
                />
                <FieldDescription>{t("register.identifierHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="api-name">{tc("name")}</FieldLabel>
                <Input id="api-name" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} placeholder={t("register.namePlaceholder")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="api-scopes">{t("register.scopes")}</FieldLabel>
                <Input
                  id="api-scopes"
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  disabled={submitting}
                  placeholder="orders:read orders:write"
                />
                <FieldDescription>{t("register.scopesHint", { grant: "client_credentials" })}</FieldDescription>
              </Field>
              <Field>
                <CheckboxField
                  id="api-restrict"
                  checked={restrict}
                  onChange={setRestrict}
                  disabled={submitting}
                  label={t("restrictLabel")}
                  hint={t("restrictHint")}
                />
              </Field>
              <Field>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {submitting ? t("register.submitting") : t("register.submit")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("list.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apis.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {apis.map((api) => (
                <ApiItem key={api.identifier} api={api} applications={applications} />
              ))}
            </ul>
          )}
          {envScopes.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="font-medium text-foreground">{t("list.envScopesTitle", { variable: "OAUTH_API_SCOPES" })}</p>
              <p className="mt-1 text-muted-foreground">
                {t.rich("list.envScopesText", {
                  scopes: envScopes.join(" "),
                  mono: (chunks) => <span className="font-mono">{chunks}</span>,
                })}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
