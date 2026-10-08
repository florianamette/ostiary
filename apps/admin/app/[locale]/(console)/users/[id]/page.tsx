import { and, desc, eq, gt, or } from "drizzle-orm";
import { notFound } from "next/navigation";

import { formatDateTime, PageHeader } from "@/components/admin/common/page-header";
import {
  AdminUserDetailActions,
  ResetTwoFactorButton,
  RevokeSessionButton,
} from "@/components/admin/users/admin-user-detail-actions";
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
  account,
  auditLog,
  authEvent,
  member,
  organization,
  passkey,
  session,
  user,
} from "@ostiary/core/db/schema";
import { listUserApiKeys } from "@ostiary/core/lib/api-keys";
import { env } from "@ostiary/core/lib/env";
import { ApiKeysTable } from "@/components/admin/api-keys/api-keys-table";
import { toAdminApiKeyRows } from "@/lib/api-key-rows";
import { SocialProviderIcon } from "@ostiary/core/components/brand/social-provider-icon";
import { isSocialProvider, SOCIAL_PROVIDER_LABELS } from "@ostiary/core/lib/social-provider-meta";
import { Link } from "@/i18n/navigation";
import { AUDIT_ACTION_LABELS } from "@/lib/admin-audit";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  sign_in: "Signed in",
  sign_up: "Created account",
  sign_out: "Signed out",
  sign_in_failed: "Failed sign-in",
};

const PROVIDER_LABELS: Record<string, string> = {
  credential: "Email and password",
  ...SOCIAL_PROVIDER_LABELS,
};

function shortAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const admin = await requireAdminSession();
  const { locale, id } = await params;

  const [u] = await db.select().from(user).where(eq(user.id, id));
  if (!u) notFound();

  const [sessions, accounts, passkeys, memberships, events, audits, apiKeys] = await Promise.all([
    db.select().from(session).where(and(eq(session.userId, id), gt(session.expiresAt, new Date()))).orderBy(desc(session.updatedAt)),
    db.select({ id: account.id, providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, id)),
    db.select({ id: passkey.id, name: passkey.name, deviceType: passkey.deviceType, createdAt: passkey.createdAt }).from(passkey).where(eq(passkey.userId, id)),
    db
      .select({ id: member.id, role: member.role, orgId: organization.id, orgName: organization.name, orgSlug: organization.slug })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, id)),
    db
      .select()
      .from(authEvent)
      .where(or(eq(authEvent.userId, id), eq(authEvent.identifier, u.email), u.username ? eq(authEvent.identifier, u.username) : undefined))
      .orderBy(desc(authEvent.createdAt))
      .limit(15),
    db.select().from(auditLog).where(and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, id))).orderBy(desc(auditLog.createdAt)).limit(15),
    listUserApiKeys(id),
  ]);

  const roles = (u.role ?? "user").split(",").map((r) => r.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/users", label: "Users" }}
        title={u.name || u.email}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{u.email}</span>
            {u.username ? <span className="font-mono text-xs">@{u.displayUsername ?? u.username}</span> : null}
            {roles.map((r) => (
              <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
            ))}
            <Badge variant="outline">{u.emailVerified ? "Email verified" : "Email not verified"}</Badge>
            {u.banned ? <Badge variant="destructive">Banned{u.banReason ? `: ${u.banReason}` : ""}</Badge> : null}
          </span>
        }
        actions={
          <AdminUserDetailActions
            user={{ id: u.id, name: u.name, email: u.email, role: u.role, banned: u.banned, emailVerified: u.emailVerified }}
            currentUserId={admin.user.id}
            authAppUrl={env.AUTH_APP_URL ?? ""}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Joined", value: formatDateTime(u.createdAt, locale) },
          { label: "Active sessions", value: String(sessions.length) },
          { label: "Passkeys", value: String(passkeys.length) },
          { label: "Two-factor", value: u.twoFactorEnabled ? "On" : "Off" },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="mt-2 text-base font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>

      <Section title="Active sessions" description="Devices where this account is signed in.">
        {sessions.length === 0 ? (
          <Empty>No active sessions.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead className="hidden md:table-cell">IP address</TableHead>
                <TableHead className="hidden sm:table-cell">Last active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">
                    {shortAgent(s.userAgent)}
                    {s.impersonatedBy ? <Badge variant="outline" className="ml-2">Impersonated</Badge> : null}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{s.ipAddress ?? "-"}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDateTime(s.updatedAt, locale)}</TableCell>
                  <TableCell className="text-right">
                    <RevokeSessionButton userId={u.id} sessionId={s.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="API keys" description="Keys this account created for scripts. Banning or deleting the account revokes them.">
        <ApiKeysTable rows={toAdminApiKeyRows(apiKeys)} locale={locale} showOwner={false} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sign-in methods">
          <ul className="space-y-2 text-sm">
            {accounts.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className="flex items-center gap-2">
                  {isSocialProvider(a.providerId) ? (
                    <SocialProviderIcon provider={a.providerId} className="size-4" />
                  ) : null}
                  {PROVIDER_LABELS[a.providerId] ?? `SSO: ${a.providerId}`}
                </span>
                <span className="text-muted-foreground">{formatDateTime(a.createdAt, locale)}</span>
              </li>
            ))}
            {passkeys.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span>Passkey: {p.name?.trim() || "Unnamed"} <span className="text-muted-foreground">({p.deviceType})</span></span>
                <span className="text-muted-foreground">{formatDateTime(p.createdAt, locale)}</span>
              </li>
            ))}
            {accounts.length + passkeys.length === 0 ? <Empty>No sign-in methods.</Empty> : null}
            {u.twoFactorEnabled ? (
              <li className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                <span>Two-factor authentication <span className="text-muted-foreground">(authenticator app)</span></span>
                {u.id === admin.user.id ? (
                  <span className="text-muted-foreground">Managed from your account</span>
                ) : (
                  <ResetTwoFactorButton userId={u.id} email={u.email} />
                )}
              </li>
            ) : null}
          </ul>
        </Section>

        <Section title="Organizations">
          {memberships.length === 0 ? (
            <Empty>Not a member of any organization.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {memberships.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <Link href={`/organizations/${m.orgId}`} className="underline-offset-4 hover:underline">{m.orgName}</Link>
                  <Badge variant="secondary">{m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Recent sign-in activity">
          {events.length === 0 ? (
            <Empty>No activity recorded yet.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span className={e.type === "sign_in_failed" ? "text-destructive" : undefined}>
                    {EVENT_LABELS[e.type] ?? e.type}
                    {e.ipAddress ? <span className="ml-2 font-mono text-xs text-muted-foreground">{e.ipAddress}</span> : null}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(e.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Admin actions on this account">
          {audits.length === 0 ? (
            <Empty>No admin actions yet.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {audits.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span>
                    {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                    <span className="ml-2 text-xs text-muted-foreground">by {a.actorEmail ?? "system"}</span>
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(a.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
