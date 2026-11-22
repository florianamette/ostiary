"use client";

import { usePathname } from "@ostiary/core/i18n/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@ostiary/core/components/ui/sidebar";

import { NavMainLeafItem } from "./nav-main-leaf-item";
import type { NavMainItem } from "./types";

export type { NavMainItem } from "./types";

/** One group of sidebar links. Without `groupLabel`, the group has no heading. */
export function NavMain({
  items,
  groupLabel,
}: {
  groupLabel?: string;
  items: NavMainItem[];
}) {
  // Without the locale prefix ("/users", not "/en/users"), like the items' urls.
  const pathname = usePathname();

  return (
    <SidebarGroup>
      {groupLabel ? <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel> : null}
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
