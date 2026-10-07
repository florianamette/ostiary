import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { env } from "@ostiary/core/lib/env";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const sessionUser = session?.user;
  if (!sessionUser) {
    // Sign-in happens on the auth app. Come back here once the session exists.
    const back = `${env.ADMIN_APP_URL}/${locale}`;
    redirect(
      `${env.AUTH_APP_URL}/${locale}/login?callbackURL=${encodeURIComponent(back)}`,
    );
  }

  if (!userHasAdminRole(sessionUser.role, ["admin"])) {
    redirect(`${env.AUTH_APP_URL}/${locale}/dashboard`);
  }

  return (
    <AdminShell
      user={{
        name: sessionUser.name ?? "Admin",
        email: sessionUser.email,
        avatar: sessionUser.image ?? undefined,
      }}
    >
      {children}
    </AdminShell>
  );
}
