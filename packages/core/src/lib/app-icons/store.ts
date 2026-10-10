import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { appIcon, oauthClient } from "@ostiary/core/db/schema";
import { resolveAppIcon, type ResolvedIcon } from "@ostiary/core/lib/app-icons/resolve";
import { appIconSource, iconSourceKey, type IconSource } from "@ostiary/core/lib/app-icons/site";
import type { IconType } from "@ostiary/core/lib/app-icons/image";

/** A found icon is looked up again after a week, a failure after a day. */
const ICON_REFRESH_MS = 7 * 24 * 3600 * 1000;
const ICON_RETRY_MS = 24 * 3600 * 1000;

export type StoredIcon = { contentType: IconType; data: Buffer; fetchedAt: Date };

// One lookup per source at a time in this instance, however many tabs ask for it.
const inFlight = ((globalThis as { __ostiaryAppIcons?: Map<string, Promise<StoredIcon | null>> }).__ostiaryAppIcons ??= new Map());

async function refresh(source: IconSource, key: string, previous: StoredIcon | null): Promise<StoredIcon | null> {
  const result = await resolveAppIcon(source).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Lookup failed.",
  }));
  const now = new Date();
  if (result.ok) {
    await save(key, result.icon, null, now);
    return { ...result.icon, fetchedAt: now };
  }
  if (previous) {
    // Keep showing the icon we had; try again in a day.
    const retryAt = new Date(now.getTime() - ICON_REFRESH_MS + ICON_RETRY_MS);
    await save(key, previous, result.error, retryAt);
    return previous;
  }
  await save(key, null, result.error, now);
  return null;
}

async function save(key: string, icon: ResolvedIcon | null, error: string | null, fetchedAt: Date) {
  const values = {
    contentType: icon?.contentType ?? null,
    data: icon?.data ?? null,
    error: error?.slice(0, 500) ?? null,
    fetchedAt,
  };
  await db
    .insert(appIcon)
    .values({ source: key, ...values })
    .onConflictDoUpdate({ target: appIcon.source, set: values })
    .catch((e: unknown) => console.error("Could not cache an app icon", e));
}

/** The icon for a source, from the cache or looked up when missing or stale. */
export async function getIconForSource(source: IconSource): Promise<StoredIcon | null> {
  const key = iconSourceKey(source);
  const [row] = await db.select().from(appIcon).where(eq(appIcon.source, key)).limit(1);
  const stored: StoredIcon | null =
    row?.data && row.contentType ? { contentType: row.contentType as IconType, data: row.data, fetchedAt: row.fetchedAt } : null;
  if (row) {
    const age = Date.now() - row.fetchedAt.getTime();
    if (age < (stored ? ICON_REFRESH_MS : ICON_RETRY_MS)) return stored;
  }
  let pending = inFlight.get(key);
  if (!pending) {
    pending = refresh(source, key, stored).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

/** The icon of an OAuth client (see appIconSource), or null when it has none. */
export async function getAppIconForClient(clientId: string): Promise<StoredIcon | null> {
  const [client] = await db
    .select({ icon: oauthClient.icon, uri: oauthClient.uri, redirectUris: oauthClient.redirectUris })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  if (!client) return null;
  const source = appIconSource(client);
  return source ? getIconForSource(source) : null;
}

/**
 * The HTTP answer for an icon. The type is the sniffed one; SVG gets a CSP that forbids
 * scripts and any loads, so even opened directly (not through <img>) it cannot run code.
 */
export function appIconResponse(icon: StoredIcon | null): Response {
  const common = {
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "cross-origin-resource-policy": "same-site",
    "referrer-policy": "no-referrer",
  };
  if (!icon) {
    return new Response(null, { status: 404, headers: { ...common, "cache-control": "private, max-age=3600" } });
  }
  return new Response(new Uint8Array(icon.data), {
    status: 200,
    headers: {
      ...common,
      "content-type": icon.contentType,
      "content-length": String(icon.data.length),
      "content-disposition": "inline",
      "cache-control": "private, max-age=604800, stale-while-revalidate=86400",
      "last-modified": icon.fetchedAt.toUTCString(),
    },
  });
}
