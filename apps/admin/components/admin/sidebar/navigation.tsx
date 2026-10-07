"use client";

import {
  Boxes,
  Building2,
  History,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { NavMainItem } from "@ostiary/core/components/sidebar/nav-main";

export function useAdminSectionNavItems(): NavMainItem[] {
  const t = useTranslations("admin.nav");
  return [
    {
      title: t("overview"),
      url: "/",
      icon: <LayoutDashboard />,
      exact: true,
    },
    {
      title: t("users"),
      url: "/users",
      icon: <Users />,
    },
    {
      title: t("organizations"),
      url: "/organizations",
      icon: <Building2 />,
    },
    {
      title: t("sso"),
      url: "/sso",
      icon: <KeyRound />,
    },
    {
      title: t("security"),
      url: "/security",
      icon: <ShieldAlert />,
    },
    {
      title: t("audit"),
      url: "/audit",
      icon: <History />,
    },
  ];
}

export function useOauthSectionNavItems(): NavMainItem[] {
  const t = useTranslations("admin.nav");
  return [
    {
      title: t("applications"),
      url: "/applications",
      icon: <Boxes />,
    },
    {
      title: t("consent"),
      url: "/consent",
      icon: <ScrollText />,
    },
  ];
}
