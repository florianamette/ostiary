"use client";

import { AdminHeader } from "@/components/admin/admin-header";
import {
  AdminSidebar,
  type AdminSidebarUser,
} from "@/components/admin/sidebar";
import { SidebarInset, SidebarProvider } from "@ostiary/core/components/ui/sidebar";
import { TooltipProvider } from "@ostiary/core/components/ui/tooltip";

function AdminMain({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0 md:p-6">{children}</div>
  );
}

export function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: AdminSidebarUser;
}) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AdminSidebar user={user} />
        <SidebarInset className="min-w-0">
          <AdminHeader />
          <AdminMain>{children}</AdminMain>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export type { AdminSidebarUser };
