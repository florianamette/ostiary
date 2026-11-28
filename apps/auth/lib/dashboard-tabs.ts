/*
 * The account page's tabs, each its own route under /dashboard. Before they were routes, every
 * section sat on one page and was linked by its anchor (/dashboard#security): those links still
 * exist in emails, bookmarks and other apps, so the overview forwards them (LEGACY_ANCHORS).
 */

export const DASHBOARD_TABS = ["overview", "profile", "organizations", "security", "activity", "apps", "api-keys", "data"] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

/** The tab's path (without the locale), and an anchor inside it. */
export function dashboardHref(tab: DashboardTab, anchor?: string): string {
  return `/dashboard${tab === "overview" ? "" : `/${tab}`}${anchor ? `#${anchor}` : ""}`;
}

/** The tab a path (without the locale) shows: "/dashboard/security" is "security". */
export function dashboardTabOf(pathname: string): DashboardTab {
  const segment = pathname.replace(/\/+$/, "").split("/")[2];
  return (DASHBOARD_TABS as readonly string[]).includes(segment ?? "") ? (segment as DashboardTab) : "overview";
}

/** The old one-page anchors: the tab now showing that section, and the anchor inside it. */
export const LEGACY_ANCHORS: Readonly<Record<string, readonly [DashboardTab, string?]>> = {
  profile: ["profile"],
  phone: ["profile", "phone"],
  organizations: ["organizations"],
  security: ["security"],
  "two-factor": ["security", "two-factor"],
  passkeys: ["security", "passkeys"],
  sessions: ["security", "sessions"],
  activity: ["activity"],
  apps: ["apps"],
  "api-keys": ["api-keys"],
  data: ["data"],
  "delete-account": ["data", "delete-account"],
};
