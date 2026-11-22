"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { LogoMark } from "@ostiary/core/components/brand/logo";
import { NavMain } from "@ostiary/core/components/sidebar/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@ostiary/core/components/ui/sidebar";
import { brand } from "@ostiary/core/lib/brand";
import { AdminNavUser } from "@/components/admin/admin-nav-user";
import { Link } from "@/i18n/navigation";

import { useAdminNavSections } from "./navigation";
import type { AdminSidebarUser } from "./types";

export type { AdminSidebarUser } from "./types";

/** The product's mark and name, linking to the overview. Only the mark shows when collapsed. */
function AdminSidebarBrand() {
  const t = useTranslations("admin.header");
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* Collapsed, the button is the size of the mark: no padding around it. */}
        <SidebarMenuButton size="lg" asChild tooltip={brand.name} className="group-data-[collapsible=icon]:p-0!">
          <Link href="/">
            {/* `!`: the menu button sizes every svg inside it to an icon (size-4). */}
            <LogoMark className="size-8!" />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-heading font-semibold tracking-[-0.02em]">{brand.name}</span>
              <span className="truncate text-xs text-muted-foreground">{t("crumb")}</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AdminSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: AdminSidebarUser }) {
  const sections = useAdminNavSections();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AdminSidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section, index) => (
          <NavMain key={section.label ?? index} items={section.items} groupLabel={section.label} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <AdminNavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
