"use client";

import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@ostiary/core/components/ui/sidebar";

import { NavMainLeafItem } from "./nav-main-leaf-item";
import type { NavMainItem } from "./types";

export type { NavMainItem } from "./types";

export function NavMain({
  items,
  groupLabel = "Platform",
}: {
  groupLabel?: string;
  items: NavMainItem[];
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.url
            : pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <NavMainLeafItem
              key={item.title}
              item={item}
              active={active}
            />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
