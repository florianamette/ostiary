"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, LogOutIcon, UserPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PreferencesMenuItems } from "@ostiary/core/components/layout/preferences-menu-items";
import { Avatar, AvatarFallback } from "@ostiary/core/components/ui/avatar";
import { Button } from "@ostiary/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import { addAccountHref, MAX_DEVICE_SESSIONS, type DeviceAccount } from "@ostiary/core/lib/device-accounts";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useDeviceAccounts } from "@/lib/device-sessions";

function initialOf(name: string, email: string) {
  return (name || email).trim().charAt(0).toUpperCase();
}

function AccountRow({ account, active }: { account: Pick<DeviceAccount, "name" | "email">; active?: boolean }) {
  return (
    <>
      <Avatar className="size-7">
        <AvatarFallback className="text-xs font-medium">{initialOf(account.name, account.email)}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{account.name || account.email}</span>
        {account.name ? <span className="truncate text-xs text-muted-foreground">{account.email}</span> : null}
      </span>
      {active ? <CheckIcon className="size-4 text-muted-foreground" aria-hidden /> : null}
    </>
  );
}

/**
 * Header menu of the dashboard. Lists every account signed in on this browser: choosing one
 * switches to it, "Add another account" signs in one more, "Sign out" leaves the active account
 * only (the next one takes over) and "Sign out of all accounts" ends every session.
 */
export function AccountMenu({
  user,
  isAdmin,
  multiAccount = true,
}: {
  user: { id: string; name: string; email: string };
  isAdmin: boolean;
  /** Off while impersonating: the impersonated session is not one of the person's accounts. */
  multiAccount?: boolean;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const accounts = useDeviceAccounts(user.id);
  const [busy, setBusy] = React.useState(false);

  const displayName = user.name || user.email;
  const others = multiAccount ? (accounts ?? []).filter((a) => a.userId !== user.id) : [];
  const current = accounts?.find((a) => a.userId === user.id);
  const canAdd = multiAccount && (accounts?.length ?? 1) < MAX_DEVICE_SESSIONS;
  const dashboardHref = `/${locale}/dashboard`;

  async function switchTo(account: DeviceAccount) {
    setBusy(true);
    const { error } = await authClient.multiSession.setActive({ sessionToken: account.token });
    if (error) {
      setBusy(false);
      toast.error(t("accounts.switchFailed"));
      return;
    }
    // Server components read the session: reload rather than re-render.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: the active session changed
    window.location.assign(dashboardHref);
  }

  async function signOutActive() {
    setBusy(true);
    // With other accounts signed in, end only this session; the plugin makes the next one active.
    if (current && others.length > 0) {
      const { error } = await authClient.multiSession.revoke({ sessionToken: current.token });
      if (!error) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: the active session changed
        window.location.assign(dashboardHref);
        return;
      }
    }
    await signOutAll();
  }

  async function signOutAll() {
    setBusy(true);
    await authClient.signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: the session is gone
    window.location.assign(`/${locale}/login`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" className="h-9 min-w-0 gap-2 px-1.5" aria-label={t("accountMenu")} disabled={busy}>
          <Avatar className="size-7">
            <AvatarFallback className="text-xs font-medium">{initialOf(user.name, user.email)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm sm:inline">{displayName}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex min-w-0 items-center gap-2 font-normal">
          <AccountRow account={user} active={others.length > 0} />
        </DropdownMenuLabel>
        {others.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("accounts.switchTo")}</DropdownMenuLabel>
            {others.map((account) => (
              <DropdownMenuItem key={account.userId} disabled={busy} onSelect={() => void switchTo(account)}>
                <AccountRow account={account} />
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {canAdd ? (
          <DropdownMenuItem asChild>
            <a href={addAccountHref(locale, new URLSearchParams({ callbackURL: dashboardHref }))}>
              <UserPlusIcon className="size-4" aria-hidden />
              {t("accounts.add")}
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <a href={process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "/"}>{t("nav.admin")}</a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/">{t("nav.marketingHome")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <PreferencesMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => void signOutActive()}>
          <LogOutIcon className="size-4" aria-hidden />
          {others.length > 0 ? t("accounts.signOutOf", { email: user.email }) : t("nav.signOut")}
        </DropdownMenuItem>
        {others.length > 0 ? (
          <DropdownMenuItem disabled={busy} onSelect={() => void signOutAll()}>
            <LogOutIcon className="size-4" aria-hidden />
            {t("accounts.signOutAll")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
