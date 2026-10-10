import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthClient, oauthClientBranding } from "@ostiary/core/db/schema";
import { accentCssVariables } from "@ostiary/core/lib/app-branding/color";
import {
  createAppContextToken,
  resumeAuthorizePath,
  type VerifiedAppContext,
} from "@ostiary/core/lib/app-branding/context";
import type { BrandingValues, LogoSource, ValidImage } from "@ostiary/core/lib/app-branding/validation";
import { getAppIconForClient, getIconForSource, type StoredIcon } from "@ostiary/core/lib/app-icons/store";
import type { IconType } from "@ostiary/core/lib/app-icons/image";
import { appIconSource } from "@ostiary/core/lib/app-icons/site";
import { registrationSource } from "@ostiary/core/lib/client-registration-policy";

/** What the admin console edits. Images are flags: the bytes are served by a route. */
export type AppBrandingSettings = {
  displayName: string | null;
  tagline: string | null;
  accentColor: string | null;
  logoSource: LogoSource;
  logoUrl: string | null;
  hasLogoUpload: boolean;
  panelText: string | null;
  hasPanelImage: boolean;
  socialProviders: string[] | null;
  updatedAt: string | null;
};

const EMPTY_BRANDING: AppBrandingSettings = {
  displayName: null,
  tagline: null,
  accentColor: null,
  logoSource: "app_icon",
  logoUrl: null,
  hasLogoUpload: false,
  panelText: null,
  hasPanelImage: false,
  socialProviders: null,
  updatedAt: null,
};

/**
 * The app as the sign-in screens show it. `verified` is false for a client that registered
 * itself (dynamic registration or a metadata document): it gets its name with a warning and
 * nothing else, since its name, logo and colors were never reviewed by an admin.
 */
export type AuthScreenApp = {
  clientId: string;
  name: string;
  verified: boolean;
  /** Same-origin URL of the logo (see /api/app-branding), or null for the monogram. */
  logoUrl: string | null;
  tagline: string | null;
  /** CSS custom properties for `[data-app-brand]`, or null to keep the theme's colors. */
  accent: Record<string, string> | null;
  panelText: string | null;
  panelImageUrl: string | null;
  /** Social providers to show (ids); null shows every enabled one. */
  socialProviders: string[] | null;
  /** Token for links to screens the signed request does not reach (sign-up, reset). */
  token: string;
  /** Path that restarts the authorization request after sign-up or a password reset. */
  resumePath: string;
};

const selectClient = {
  clientId: oauthClient.clientId,
  name: oauthClient.name,
  disabled: oauthClient.disabled,
  clientDiscoveryId: oauthClient.clientDiscoveryId,
  metadata: oauthClient.metadata,
  adminRegistered: oauthClient.adminRegistered,
  icon: oauthClient.icon,
  uri: oauthClient.uri,
  redirectUris: oauthClient.redirectUris,
};

async function loadRow(clientId: string) {
  const [row] = await db
    .select({ client: selectClient, branding: oauthClientBranding })
    .from(oauthClient)
    .leftJoin(oauthClientBranding, eq(oauthClientBranding.clientId, oauthClient.clientId))
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return row ?? null;
}

type BrandingRow = typeof oauthClientBranding.$inferSelect;

function toSettings(row: BrandingRow | null): AppBrandingSettings {
  if (!row) return EMPTY_BRANDING;
  return {
    displayName: row.displayName,
    tagline: row.tagline,
    accentColor: row.accentColor,
    logoSource: row.logoSource as LogoSource,
    logoUrl: row.logoUrl,
    hasLogoUpload: Boolean(row.logoData && row.logoContentType),
    panelText: row.panelText,
    hasPanelImage: Boolean(row.panelImageData && row.panelImageContentType),
    socialProviders: row.socialProviders ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** For the admin console. Null when the client does not exist. */
export async function getAppBranding(clientId: string): Promise<{ settings: AppBrandingSettings; admin: boolean } | null> {
  const row = await loadRow(clientId);
  if (!row) return null;
  return { settings: toSettings(row.branding), admin: registrationSource(row.client) === "admin" };
}

export type BrandingImages = {
  /** New logo bytes, or "remove" to drop the uploaded one; absent keeps it. */
  logo?: ValidImage | "remove";
  panelImage?: ValidImage | "remove";
};

/** Writes the branding of an admin-registered client (the caller checks the admin). */
export async function saveAppBranding(
  clientId: string,
  values: BrandingValues,
  images: BrandingImages,
  actorId: string,
): Promise<void> {
  const logo = images.logo === "remove" ? { logoContentType: null, logoData: null } : images.logo ? { logoContentType: images.logo.contentType, logoData: images.logo.data } : {};
  const panel = images.panelImage === "remove" ? { panelImageContentType: null, panelImageData: null } : images.panelImage ? { panelImageContentType: images.panelImage.contentType, panelImageData: images.panelImage.data } : {};
  const set = { ...values, ...logo, ...panel, updatedAt: new Date(), updatedBy: actorId };
  await db
    .insert(oauthClientBranding)
    .values({ clientId, ...set })
    .onConflictDoUpdate({ target: oauthClientBranding.clientId, set });
}

export async function resetAppBranding(clientId: string): Promise<boolean> {
  const deleted = await db
    .delete(oauthClientBranding)
    .where(eq(oauthClientBranding.clientId, clientId))
    .returning({ clientId: oauthClientBranding.clientId });
  return deleted.length > 0;
}

function appBrandingAssetPath(clientId: string, asset: "logo" | "panel", version?: string | null): string {
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `/api/app-branding/${encodeURIComponent(clientId)}/${asset}${v}`;
}

/**
 * The app behind a verified context (see context.ts), as the sign-in screens show it. Null
 * when the client is gone or disabled: the screen then keeps the default look.
 */
export async function resolveAuthScreenApp(context: VerifiedAppContext, secret: string): Promise<AuthScreenApp | null> {
  const row = await loadRow(context.clientId).catch((error: unknown) => {
    console.error("Could not load app branding", error);
    return null;
  });
  if (!row || row.client.disabled) return null;
  const base = {
    clientId: row.client.clientId,
    token: createAppContextToken(context, secret),
    resumePath: resumeAuthorizePath(context.authorizeQuery),
  };
  const clientName = row.client.name?.trim() || row.client.clientId;

  if (registrationSource(row.client) !== "admin") {
    return {
      ...base,
      name: clientName,
      verified: false,
      logoUrl: null,
      tagline: null,
      accent: null,
      panelText: null,
      panelImageUrl: null,
      socialProviders: null,
    };
  }

  const settings = toSettings(row.branding);
  const version = settings.updatedAt;
  const hasLogo =
    settings.logoSource === "upload"
      ? settings.hasLogoUpload
      : settings.logoSource === "url"
        ? Boolean(settings.logoUrl)
        : Boolean(appIconSource(row.client));
  return {
    ...base,
    name: settings.displayName ?? clientName,
    verified: true,
    logoUrl: hasLogo ? appBrandingAssetPath(row.client.clientId, "logo", version) : null,
    tagline: settings.tagline,
    accent: settings.accentColor ? accentCssVariables(settings.accentColor) : null,
    panelText: settings.panelText,
    panelImageUrl: settings.hasPanelImage ? appBrandingAssetPath(row.client.clientId, "panel", version) : null,
    socialProviders: settings.socialProviders,
  };
}

/**
 * An image of an admin-registered, enabled client's branding: its logo (uploaded, fetched
 * from its URL, or the app icon) or side-panel image. Null for anything else.
 */
export async function getAppBrandingAsset(
  clientId: string,
  asset: "logo" | "panel",
  options: { allowDisabled?: boolean } = {},
): Promise<StoredIcon | null> {
  const row = await loadRow(clientId);
  if (!row || registrationSource(row.client) !== "admin") return null;
  if (row.client.disabled && !options.allowDisabled) return null;
  const branding = row.branding;
  const fetchedAt = branding?.updatedAt ?? new Date(0);
  if (asset === "panel") {
    if (!branding?.panelImageData || !branding.panelImageContentType) return null;
    return { contentType: branding.panelImageContentType as IconType, data: branding.panelImageData, fetchedAt };
  }
  if (branding?.logoSource === "upload") {
    if (!branding.logoData || !branding.logoContentType) return null;
    return { contentType: branding.logoContentType as IconType, data: branding.logoData, fetchedAt };
  }
  if (branding?.logoSource === "url" && branding.logoUrl) {
    return getIconForSource({ kind: "logo", url: branding.logoUrl });
  }
  return getAppIconForClient(clientId);
}
