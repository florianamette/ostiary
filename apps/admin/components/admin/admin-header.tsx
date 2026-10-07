"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@ostiary/core/components/ui/breadcrumb";
import { Separator } from "@ostiary/core/components/ui/separator";
import { SidebarTrigger } from "@ostiary/core/components/ui/sidebar";

function headerTitleKey(
  pathname: string,
):
  | "overview"
  | "users"
  | "applications"
  | "consent"
  | "organizations"
  | "sso"
  | "security"
  | "audit"
  | "fallback" {
  // Detail pages (/users/<id>, /organizations/<id>) take their section's crumb.
  const section = pathname === "/" ? "/" : `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  switch (section) {
    case "/":
      return "overview";
    case "/users":
      return "users";
    case "/applications":
      return "applications";
    case "/consent":
      return "consent";
    case "/organizations":
      return "organizations";
    case "/sso":
      return "sso";
    case "/security":
      return "security";
    case "/audit":
      return "audit";
    default:
      return "fallback";
  }
}

export function AdminHeader() {
  const pathname = usePathname();
  const t = useTranslations("admin");
  const key = headerTitleKey(pathname);
  const title = t(`header.${key}`);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link href="/">{t("header.crumb")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
