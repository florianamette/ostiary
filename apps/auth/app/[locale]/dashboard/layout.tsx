import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardSessionProvider, type DashboardSession } from "@/components/dashboard/dashboard-session";
import { isPlatformAdmin } from "@ostiary/core/lib/admin/user-has-admin-role";
import { env } from "@ostiary/core/lib/env";
import { getDashboardContext } from "@/lib/dashboard-context";
import { redirect } from "@/i18n/navigation";
import { noIndexMetadata } from "@/lib/page-metadata";

export const generateMetadata = noIndexMetadata("dashboard", "title", { follow: true });

export default async function DashboardLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  const { session, hasOrganizations, showApiKeys } = await getDashboardContext();

  const sessionUser = session?.user;
  if (!sessionUser) {
    redirect({
      href: `/login?callbackURL=${encodeURIComponent(`/${locale}/dashboard`)}`,
      locale,
    });
    return null;
  }

  const isAdmin = isPlatformAdmin(sessionUser.role);
  const fields = sessionUser as typeof sessionUser & {
    username?: string | null;
    displayUsername?: string | null;
    twoFactorEnabled?: boolean | null;
  };
  // What the sections read, so they render complete without waiting for /get-session.
  const initialSession: DashboardSession = {
    user: {
      id: sessionUser.id,
      name: sessionUser.name ?? "",
      email: sessionUser.email,
      emailVerified: Boolean(sessionUser.emailVerified),
      username: fields.username ?? null,
      displayUsername: fields.displayUsername ?? null,
      twoFactorEnabled: Boolean(fields.twoFactorEnabled),
    },
    session: {
      id: session.session.id,
      activeOrganizationId:
        (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
    },
  };

  return (
    <DashboardSessionProvider initial={initialSession}>
    <DashboardShell
      user={{
        id: sessionUser.id,
        name: sessionUser.name ?? "",
        email: sessionUser.email,
      }}
      isAdmin={isAdmin}
      showOrganizations={hasOrganizations}
      showApiKeys={showApiKeys}
      impersonation={
        session?.session.impersonatedBy
          ? { userId: sessionUser.id, adminAppUrl: env.ADMIN_APP_URL ?? null }
          : null
      }
    >
      {children}
    </DashboardShell>
    </DashboardSessionProvider>
  );
}
