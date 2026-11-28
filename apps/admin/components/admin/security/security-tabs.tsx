"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ostiary/core/components/ui/tabs";

export const SECURITY_VIEWS = ["settings", "monitoring"] as const;
export type SecurityView = (typeof SECURITY_VIEWS)[number];

/**
 * The Security page's two halves: who can sign in and how (settings), and failed sign-ins and
 * banned accounts (monitoring). The open one is in the URL (?view=monitoring), to link to it.
 */
export function SecurityTabs({
  initial,
  settings,
  monitoring,
}: {
  initial: SecurityView;
  settings: React.ReactNode;
  monitoring: React.ReactNode;
}) {
  const t = useTranslations("admin.pages.security.tabs");
  return (
    <Tabs
      defaultValue={initial}
      onValueChange={(view) => {
        const url = new URL(window.location.href);
        if (view === "settings") url.searchParams.delete("view");
        else url.searchParams.set("view", view);
        window.history.replaceState(null, "", url);
      }}
      className="gap-6"
    >
      <TabsList>
        <TabsTrigger value="settings">{t("settings")}</TabsTrigger>
        <TabsTrigger value="monitoring">{t("monitoring")}</TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="space-y-6">
        {settings}
      </TabsContent>
      <TabsContent value="monitoring" className="space-y-6">
        {monitoring}
      </TabsContent>
    </Tabs>
  );
}
