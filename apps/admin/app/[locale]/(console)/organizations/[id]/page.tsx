import { and, asc, count, desc, eq, gt } from "drizzle-orm";
import { notFound } from "next/navigation";

import { formatDateTime, PageHeader } from "@/components/admin/common/page-header";
import {
  CancelInvitationButton,
  InviteMemberForm,
  MemberRoleSelect,
  RemoveMemberButton,
  RenameOrganizationForm,
} from "@/components/admin/organizations/admin-organization-controls";
import { OrganizationScim, type ScimTokenSummary } from "@/components/admin/organizations/admin-organization-scim";
import { Badge } from "@ostiary/core/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { db } from "@ostiary/core/db/index";
import {
  auditLog,
  invitation,
  member,
  organization,
  scimManagedConnection,
  scimManagedCredential,
  scimUser,
  ssoProvider,
  user,
} from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { scimBaseUrl } from "@ostiary/core/lib/scim";
import { Link } from "@/i18n/navigation";
import { AUDIT_ACTION_LABELS } from "@/lib/admin-audit";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  await requireAdminSession();
  const { locale, id } = await params;

  const [org] = await db.select().from(organization).where(eq(organization.id, id));
  if (!org) notFound();
  const isPublic = org.id === PUBLIC_ORGANIZATION_ID;

  const now = new Date();
  const [members, invites, providers, audits, scimTokens, scimUsers] = await Promise.all([
    db
      .select({ id: member.id, role: member.role, joined: member.createdAt, userId: user.id, name: user.name, email: user.email, banned: user.banned })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, id))
      .orderBy(asc(user.name))
      .limit(isPublic ? 50 : 500),
    db
      .select()
      .from(invitation)
      .where(and(eq(invitation.organizationId, id), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date())))
      .orderBy(desc(invitation.createdAt)),
    db.select({ providerId: ssoProvider.providerId, domain: ssoProvider.domain, verified: ssoProvider.domainVerified }).from(ssoProvider).where(eq(ssoProvider.organizationId, id)),
    db.select().from(auditLog).where(and(eq(auditLog.targetType, "organization"), eq(auditLog.targetId, id))).orderBy(desc(auditLog.createdAt)).limit(15),
    db
      .select({ createdAt: scimManagedCredential.createdAt, expiresAt: scimManagedCredential.expiresAt, lastUsedAt: scimManagedCredential.lastUsedAt })
      .from(scimManagedCredential)
      .innerJoin(scimManagedConnection, eq(scimManagedCredential.connectionRecordId, scimManagedConnection.id))
      .where(
        and(
          eq(scimManagedConnection.provisioningDomainId, id),
          eq(scimManagedConnection.status, "active"),
          eq(scimManagedCredential.status, "active"),
          gt(scimManagedCredential.expiresAt, now),
        ),
      )
      .orderBy(desc(scimManagedCredential.createdAt))
      .limit(1),
    db
      .select({ active: scimUser.active, n: count() })
      .from(scimUser)
      .where(eq(scimUser.provisioningDomainId, id))
      .groupBy(scimUser.active),
  ]);
  const provisionedIds = isPublic
    ? new Set<string>()
    : new Set(
        (await db.select({ userId: scimUser.userId }).from(scimUser).where(eq(scimUser.provisioningDomainId, id))).map((r) => r.userId),
      );
  const scimToken: ScimTokenSummary | null = scimTokens[0]
    ? {
        created: formatDateTime(scimTokens[0].createdAt, locale),
        expires: formatDateTime(scimTokens[0].expiresAt, locale),
        lastUsed: scimTokens[0].lastUsedAt ? formatDateTime(scimTokens[0].lastUsedAt, locale) : null,
      }
    : null;
  const provisionedActive = scimUsers.find((r) => r.active)?.n ?? 0;
  const provisionedInactive = scimUsers.find((r) => !r.active)?.n ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/organizations", label: "Organizations" }}
        title={org.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{org.slug}</span>
            {isPublic ? <Badge variant="secondary">Default workspace</Badge> : null}
            <span>Created {formatDateTime(org.createdAt, locale)}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
            <CardDescription>
              {isPublic
                ? "Every account belongs to the Public workspace, so members can't be removed here. Showing the first 50."
                : `${members.length} ${members.length === 1 ? "member" : "members"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="hidden sm:table-cell">Joined</TableHead>
                    <TableHead>Role</TableHead>
                    {isPublic ? null : <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/users/${m.userId}`} className="block font-medium underline-offset-4 hover:underline">{m.name || m.email}</Link>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {m.email}
                          {provisionedIds.has(m.userId) ? <Badge variant="outline">SCIM</Badge> : null}
                          {m.banned ? <Badge variant="destructive">{provisionedIds.has(m.userId) ? "Deactivated" : "Banned"}</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDateTime(m.joined, locale)}</TableCell>
                      <TableCell>
                        {isPublic ? <Badge variant="secondary">{m.role}</Badge> : <MemberRoleSelect orgId={id} memberId={m.id} role={m.role} />}
                      </TableCell>
                      {isPublic ? null : (
                        <TableCell className="text-right">
                          <RemoveMemberButton orgId={id} memberId={m.id} email={m.email} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {isPublic ? null : (
              <div className="space-y-3 border-t border-border/60 pt-6">
                <InviteMemberForm orgId={id} />
                {invites.length ? (
                  <ul className="space-y-2">
                    {invites.map((inv) => (
                      <li key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {inv.email} <Badge variant="outline" className="ml-1">{inv.role}</Badge>
                          <span className="ml-2 text-xs text-muted-foreground">expires {formatDateTime(inv.expiresAt, locale)}</span>
                        </span>
                        <CancelInvitationButton orgId={id} invitationId={inv.id} email={inv.email} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No pending invitations.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <RenameOrganizationForm id={org.id} name={org.name} slug={org.slug} />
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Single sign-on</CardTitle>
              <CardDescription>Identity providers attached to this organization.</CardDescription>
            </CardHeader>
            <CardContent>
              {providers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None. <Link href="/sso" className="underline underline-offset-4">Set one up</Link>.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {providers.map((p) => (
                    <li key={p.providerId} className="flex items-center justify-between gap-2">
                      <Link href="/sso" className="underline-offset-4 hover:underline">{p.providerId}</Link>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {p.domain}
                        <Badge variant={p.verified ? "secondary" : "outline"}>{p.verified ? "Verified" : "Unverified"}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {isPublic ? null : (
            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">SCIM provisioning</CardTitle>
                <CardDescription>
                  Your identity provider (Okta, Entra ID and others) creates this organization&apos;s accounts and deactivates them when people leave.
                  {provisionedActive + provisionedInactive > 0
                    ? ` ${provisionedActive} provisioned, ${provisionedInactive} deactivated.`
                    : null}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrganizationScim orgId={org.id} baseUrl={scimBaseUrl(env.AUTH_APP_URL ?? "")} token={scimToken} />
              </CardContent>
            </Card>
          )}

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Recent admin actions</CardTitle>
            </CardHeader>
            <CardContent>
              {audits.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {audits.map((a) => (
                    <li key={a.id}>
                      {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                      <span className="block text-xs text-muted-foreground">
                        {a.actorEmail ?? "system"} · {formatDateTime(a.createdAt, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
