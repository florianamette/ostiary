"use client";

import { Link } from "@ostiary/core/i18n/navigation";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ostiary/core/components/ui/sidebar";

import type { NavMainItem } from "./types";

export function NavMainLeafItem({
  item,
  active,
}: {
  item: NavMainItem;
  active: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
        <Link href={item.url}>
          {item.icon}
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
