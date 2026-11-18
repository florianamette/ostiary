"use client";

import * as React from "react";
import { KeyRoundIcon } from "lucide-react";
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
import { Field, FieldDescription, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { useAsyncResource } from "@ostiary/core/hooks/use-async-resource";
import { useDashboardSession } from "@/components/dashboard/dashboard-session";
import { ApiKeysManager, type ApiKeysSource } from "@/components/dashboard/dashboard-api-keys-section";
import { authClient } from "@/lib/auth-client";
import { useAuthAction } from "@/lib/use-auth-action";
import {
  createOrganizationApiKey,
  getOrganizationApiKeys,
  getOrganizationsWithManagedApiKeys,
  revokeOrganizationApiKey,
} from "@/lib/organization-api-keys-actions";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";

type OrgRow = { id: string; name: string; slug: string };

function rolesAllowInvite(role: string | undefined): boolean {
  if (!role) return false;
  return role.split(",").some((r) => {
    const x = r.trim().toLowerCase();
    return x === "owner" || x === "admin";
  });
}

async function listOrganizations(): Promise<OrgRow[]> {
  const res = await authClient.organization.list();
  if (res.error) throw res.error;
  // Every account is in the default Public workspace; only real organizations are listed.
  return (Array.isArray(res.data) ? res.data : [])
    .filter((o) => o.id !== PUBLIC_ORGANIZATION_ID)
    .map((o) => ({ id: o.id, name: o.name, slug: o.slug }));
}

export function DashboardOrganizationsSection() {
  const t = useTranslations("dashboard.organizations");
  const { data: current, refetch: refetchSession } = useDashboardSession();
  const activeOrganizationId = current.session.activeOrganizationId;
  const orgsResource = useAsyncResource(listOrganizations);
  const orgs = React.useMemo(() => orgsResource.data ?? [], [orgsResource.data]);
  const { pending, run } = useAuthAction<string>();
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"member" | "admin">(
    "member",
  );
  const [memberRole, setMemberRole] = React.useState<string | undefined>();
  // Organizations whose API keys the user manages (owner or admin), and the one shown.
  const [keyOrgIds, setKeyOrgIds] = React.useState<Set<string>>(new Set());
  const [keysOpenFor, setKeysOpenFor] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getOrganizationsWithManagedApiKeys()
      .then((ids) => setKeyOrgIds(new Set(ids)))
      .catch(() => setKeyOrgIds(new Set()));
  }, [orgs]);

  React.useEffect(() => {
    if (orgsResource.error) toast.error(t("loadError"));
  }, [orgsResource.error, t]);

  React.useEffect(() => {
    void (async () => {
      if (!activeOrganizationId) {
        setMemberRole(undefined);
        return;
      }
      const res = await authClient.organization.getActiveMemberRole().catch(() => null);
      if (!res || res.error || !res.data) {
        setMemberRole(undefined);
        return;
      }
      const r = res.data.role;
      setMemberRole(
        Array.isArray(r)
          ? r.join(",")
          : typeof r === "string"
            ? r
            : undefined,
      );
    })();
  }, [activeOrganizationId, orgs]);

  function handleSetActive(organizationId: string) {
    return run(`active:${organizationId}`, {
      call: () => authClient.organization.setActive({ organizationId }),
      success: t("setActiveSuccess"),
      error: t("setActiveError"),
      onSuccess: async () => {
        await refetchSession();
        await orgsResource.reload();
      },
    });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !activeOrganizationId) {
      toast.error(t("inviteValidation"));
      return;
    }
    await run("invite", {
      call: () =>
        authClient.organization.inviteMember({
          email,
          role: inviteRole,
          organizationId: activeOrganizationId,
        }),
      success: t("inviteSuccess"),
      error: t("inviteError"),
      onSuccess: () => setInviteEmail(""),
    });
  }

  const inviting = pending === "invite";
  const canInvite =
    rolesAllowInvite(memberRole) &&
    activeOrganizationId &&
    orgs.some((o) => o.id === activeOrganizationId);

  return (
    <Card
      id="organizations"
      className="scroll-mt-32 border-border/80 shadow-sm"
    >
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t("yourOrganizations")}</h3>
          {orgsResource.loading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-14 w-full" />
            </div>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {orgs.map((o) => {
                const isActive = o.id === activeOrganizationId;
                return (
                  <li
                    key={o.id}
                    className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.slug}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {keyOrgIds.has(o.id) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-expanded={keysOpenFor === o.id}
                          onClick={() => setKeysOpenFor((open) => (open === o.id ? null : o.id))}
                        >
                          <KeyRoundIcon className="size-3.5" aria-hidden />
                          {keysOpenFor === o.id ? t("apiKeys.hide") : t("apiKeys.show")}
                        </Button>
                      ) : null}
                      {isActive ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("active")}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          loading={pending === `active:${o.id}`}
                          onClick={() => void handleSetActive(o.id)}
                        >
                          {t("switchTo")}
                        </Button>
                      )}
                    </div>
                    {keysOpenFor === o.id ? (
                      <div className="basis-full sm:mt-1">
                        <OrganizationApiKeys organization={o} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {canInvite ? (
          <form onSubmit={handleInvite} className="space-y-3">
            <h3 className="text-sm font-medium">{t("inviteTitle")}</h3>
            <FieldDescription>{t("inviteHint")}</FieldDescription>
            <Field>
              <FieldLabel htmlFor="invite-email">{t("inviteEmail")}</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviting}
              />
            </Field>
            <Field>
              <FieldLabel>{t("inviteRole")}</FieldLabel>
              <Select
                value={inviteRole}
                onValueChange={(v) =>
                  setInviteRole(v === "admin" ? "admin" : "member")
                }
                disabled={inviting}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t("roleMember")}</SelectItem>
                  <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit" variant="secondary" loading={inviting}>
              {inviting ? t("inviting") : t("inviteSend")}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * One organization's API keys, for its owners and admins: the organization owns them, so they
 * keep working when the member who created them leaves.
 */
function OrganizationApiKeys({ organization }: { organization: OrgRow }) {
  const t = useTranslations("dashboard.organizations.apiKeys");
  const source = React.useMemo<ApiKeysSource>(
    () => ({
      load: () => getOrganizationApiKeys(organization.id),
      create: (input) => createOrganizationApiKey(organization.id, input),
      revoke: (id) => revokeOrganizationApiKey(organization.id, id),
    }),
    [organization.id],
  );
  return (
    <ApiKeysManager
      source={source}
      layout="inline"
      testId={`org-api-keys-${organization.slug}`}
      title={t("title", { name: organization.name })}
      description={t("description")}
      emptyText={t("empty")}
      loadErrorText={t("loadError")}
      limitText={(max) => t("limit", { max })}
    />
  );
}
