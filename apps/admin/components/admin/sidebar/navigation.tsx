"use client";

import {
  Activity,
  Boxes,
  Building2,
  FileKey,
  History,
  IdCard,
  KeySquare,
  LayoutDashboard,
  LogIn,
  Network,
  ScrollText,
  ShieldAlert,
  Users,
  Webhook,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { NavMainItem } from "@ostiary/core/components/sidebar/nav-main";

export type AdminNavSection = {
  /** Heading of the group; none for the first one (Overview). */
  label?: string;
  items: NavMainItem[];
};

/** The console's pages, grouped by what an admin is trying to do. */
export function useAdminNavSections(): AdminNavSection[] {
  const t = useTranslations("admin.nav");
  return [
    {
      items: [{ title: t("overview"), url: "/", icon: <LayoutDashboard />, exact: true }],
    },
    {
      label: t("groupDirectory"),
      items: [
        { title: t("users"), url: "/users", icon: <Users /> },
        { title: t("organizations"), url: "/organizations", icon: <Building2 /> },
      ],
    },
    {
      label: t("groupSignIn"),
      items: [
        { title: t("signInProviders"), url: "/sign-in-providers", icon: <LogIn /> },
        { title: t("sso"), url: "/sso", icon: <IdCard /> },
        { title: t("security"), url: "/security", icon: <ShieldAlert /> },
      ],
    },
    {
      label: t("groupDevelopers"),
      items: [
        { title: t("applications"), url: "/applications", icon: <Boxes /> },
        { title: t("apis"), url: "/apis", icon: <Network /> },
        { title: t("apiKeys"), url: "/api-keys", icon: <KeySquare /> },
        { title: t("consent"), url: "/consent", icon: <ScrollText /> },
        { title: t("signingKeys"), url: "/signing-keys", icon: <FileKey /> },
        { title: t("webhooks"), url: "/webhooks", icon: <Webhook /> },
      ],
    },
    {
      label: t("groupMonitoring"),
      items: [
        { title: t("usage"), url: "/usage", icon: <Activity /> },
        { title: t("audit"), url: "/audit", icon: <History /> },
      ],
    },
  ];
}
