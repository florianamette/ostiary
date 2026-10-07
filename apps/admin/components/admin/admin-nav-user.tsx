"use client";

import { Link } from "@/i18n/navigation";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@ostiary/core/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@ostiary/core/components/ui/sidebar";
import { PreferencesMenuItems } from "@ostiary/core/components/layout/preferences-menu-items";
import { authClient } from "@/lib/auth-client";
import { userInitials } from "@ostiary/core/lib/admin/user-initials";
import {
  BadgeCheckIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
} from "lucide-react";

import { UserMenuIdentity, type UserMenuIdentityUser } from "./user-menu-identity";

function signOutAndRedirectToLogin() {
  void authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        // Sign-in lives on the auth app: the admin proxy sends "/" there and back here afterwards.
        window.location.href = "/";
      },
    },
  });
}

function SidebarUserAvatar({ user }: { user: UserMenuIdentityUser }) {
  return (
    <Avatar className="h-8 w-8 rounded-lg">
      {user.avatar ? (
        <AvatarImage src={user.avatar} alt={user.name} />
      ) : null}
      <AvatarFallback className="rounded-lg">
        {userInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function AdminNavUser({ user }: { user: UserMenuIdentityUser }) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <SidebarUserAvatar user={user} />
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4 shrink-0" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <UserMenuIdentity user={user} />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/">
                  <BadgeCheckIcon />
                  Home
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <PreferencesMenuItems />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOutAndRedirectToLogin}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
