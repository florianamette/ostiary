"use client";

import * as React from "react";

import { useRouter } from "@/i18n/navigation";
import { dashboardHref, LEGACY_ANCHORS } from "@/lib/dashboard-tabs";

/**
 * Links from before the tabs were pages point at a section of the overview (/dashboard#security,
 * in emails, bookmarks and other apps). The anchor never reaches the server, so the browser
 * forwards it to the tab that now has that section, keeping the query (?continue=...).
 */
export function DashboardLegacyAnchor() {
  const router = useRouter();
  React.useEffect(() => {
    const forward = () => {
      const target = LEGACY_ANCHORS[window.location.hash.slice(1)];
      if (!target) return;
      const [tab, anchor] = target;
      const href = dashboardHref(tab, anchor);
      const hash = href.indexOf("#");
      const path = hash === -1 ? href : href.slice(0, hash);
      router.replace(`${path}${window.location.search}${hash === -1 ? "" : href.slice(hash)}`);
    };
    forward();
    // Also a link to an anchor followed while the overview is already open.
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, [router]);
  return null;
}
