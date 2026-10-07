"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { NavMain } from "@ostiary/core/components/sidebar/nav-main";
import { AdminNavUser } from "@/components/admin/admin-nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  SidebarSeparator,
} from "@ostiary/core/components/ui/sidebar";

import {
  useAdminSectionNavItems,
  useOauthSectionNavItems,
} from "./navigation";
import type { AdminSidebarUser } from "./types";

export type { AdminSidebarUser } from "./types";

export function AdminSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: AdminSidebarUser }) {
  const t = useTranslations("admin.nav");
  const adminItems = useAdminSectionNavItems();
  const oauthItems = useOauthSectionNavItems();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain items={adminItems} groupLabel={t("groupAdmin")} />
        <SidebarSeparator className="mx-0" />
        <NavMain items={oauthItems} groupLabel={t("groupOAuth")} />
      </SidebarContent>
      <SidebarFooter>
        <AdminNavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
