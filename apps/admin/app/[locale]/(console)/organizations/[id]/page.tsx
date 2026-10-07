import { and, asc, desc, eq, gt } from "drizzle-orm";
import { notFound } from "next/navigation";

import { formatDateTime, PageHeader } from "@/components/admin/common/page-header";
import {
  CancelInvitationButton,
  InviteMemberForm,
  MemberRoleSelect,
  RemoveMemberButton,
  RenameOrganizationForm,
} from "@/components/admin/organizations/admin-organization-controls";
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
import { auditLog, invitation, member, organization, ssoProvider, user } from "@ostiary/core/db/schema";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
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

  const [members, invites, providers, audits] = await Promise.all([
    db
      .select({ id: member.id, role: member.role, joined: member.createdAt, userId: user.id, name: user.name, email: user.email })
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
  ]);

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
                        <span className="text-xs text-muted-foreground">{m.email}</span>
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
