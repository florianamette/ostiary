"use server";

import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthClient } from "@ostiary/core/db/schema";
import {
  getAppBranding,
  resetAppBranding,
  saveAppBranding,
  type AppBrandingSettings,
  type BrandingImages,
} from "@ostiary/core/lib/app-branding/store";
import {
  validateBrandingInput,
  validateLogoUpload,
  validatePanelImageUpload,
  type BrandingValues,
} from "@ostiary/core/lib/app-branding/validation";
import { accentPalette } from "@ostiary/core/lib/app-branding/color";
import { getIconForSource } from "@ostiary/core/lib/app-icons/store";
import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta";
import { enabledSocialProviders } from "@ostiary/core/lib/social-providers";
import { adminActor } from "@/lib/admin-audit";

/*
 * Per-application branding of the sign-in screens (lib/app-branding). Admin-registered
 * clients only: a self-registered client never gets custom branding, whatever an admin does.
 */

export type BrandingDialogData = {
  clientName: string;
  settings: AppBrandingSettings;
  socialProviders: SocialProviderOption[];
};

type Failure = { ok: false; error: string };

async function adminClient(clientId: string) {
  const branding = await getAppBranding(clientId);
  if (!branding) return { ok: false as const, error: "This application no longer exists." };
  if (!branding.admin) return { ok: false as const, error: "Self-registered clients cannot be branded." };
  const [row] = await db.select({ name: oauthClient.name }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1);
  return { ok: true as const, settings: branding.settings, name: row?.name ?? clientId };
}

export async function loadAppBranding(clientId: string): Promise<{ ok: true; data: BrandingDialogData } | Failure> {
  await adminActor();
  const client = await adminClient(clientId);
  if (!client.ok) return client;
  return {
    ok: true,
    data: { clientName: client.name, settings: client.settings, socialProviders: await enabledSocialProviders() },
  };
}

function text(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" ? value : null;
}

async function upload(form: FormData, key: string): Promise<Uint8Array | null> {
  const file = form.get(key);
  if (!file || typeof file === "string" || file.size === 0) return null;
  // Read at most a little past the largest limit, whatever the client claims.
  if (file.size > 2 * 1024 * 1024) return new Uint8Array(2 * 1024 * 1024 + 1);
  return new Uint8Array(await file.arrayBuffer());
}

/** Fields that differ, for the audit log (images as "changed"/"removed", never their bytes). */
function changes(before: AppBrandingSettings, after: BrandingValues, images: BrandingImages): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["displayName", "tagline", "accentColor", "logoSource", "logoUrl", "panelText", "socialProviders"] as const) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) out[key] = after[key];
  }
  if (images.logo) out.logoUpload = images.logo === "remove" ? "removed" : "changed";
  if (images.panelImage) out.panelImage = images.panelImage === "remove" ? "removed" : "changed";
  return out;
}

export async function saveAppBrandingAction(
  clientId: string,
  form: FormData,
): Promise<{ ok: true; settings: AppBrandingSettings; warnings: string[] } | Failure> {
  const { session, audit } = await adminActor();
  const client = await adminClient(clientId);
  if (!client.ok) return client;

  const providers = (await enabledSocialProviders()).map((p) => p.id);
  const socialMode = text(form, "socialMode");
  const parsed = validateBrandingInput(
    {
      displayName: text(form, "displayName"),
      tagline: text(form, "tagline"),
      accentColor: text(form, "accentColor"),
      logoSource: text(form, "logoSource"),
      logoUrl: text(form, "logoUrl"),
      panelText: text(form, "panelText"),
      socialProviders: socialMode === "some" ? form.getAll("socialProviders").filter((v): v is string => typeof v === "string") : null,
    },
    providers,
  );
  if (!parsed.ok) return parsed;
  const values = parsed.value;

  const images: BrandingImages = {};
  const logoBytes = await upload(form, "logo");
  if (logoBytes) {
    const logo = validateLogoUpload(logoBytes);
    if (!logo.ok) return logo;
    images.logo = logo.value;
  } else if (text(form, "removeLogo") === "1" || values.logoSource !== "upload") {
    if (client.settings.hasLogoUpload) images.logo = "remove";
  }
  if (values.logoSource === "upload" && !logoBytes && !client.settings.hasLogoUpload) {
    return { ok: false, error: "Choose a logo file to upload." };
  }
  const panelBytes = await upload(form, "panelImage");
  if (panelBytes) {
    const panel = validatePanelImageUpload(panelBytes);
    if (!panel.ok) return panel;
    images.panelImage = panel.value;
  } else if (text(form, "removePanelImage") === "1" && client.settings.hasPanelImage) {
    images.panelImage = "remove";
  }

  const warnings: string[] = [];
  if (values.logoSource === "url" && values.logoUrl && values.logoUrl !== client.settings.logoUrl) {
    // Fetched now by the server (SSRF guard, sniffed type) and cached, as the sign-in page will.
    const fetched = await getIconForSource({ kind: "logo", url: values.logoUrl }).catch(() => null);
    if (!fetched) return { ok: false, error: "Could not fetch an image at the logo URL. Check that it is public and is an image." };
  }
  if (values.accentColor) {
    const palette = accentPalette(values.accentColor);
    if (palette.warnings.includes("light_ui")) warnings.push("The accent is faint on the light card: buttons will barely stand out.");
    if (palette.warnings.includes("dark_ui")) warnings.push("The accent is faint on the dark card: buttons will barely stand out.");
  }

  try {
    await saveAppBranding(clientId, values, images, session.user.id);
  } catch (error) {
    console.error("Could not save app branding", error);
    return { ok: false, error: "Could not save the branding." };
  }
  await audit({
    action: "oauth_client.branding_update",
    target: { type: "oauth_client", id: clientId, label: client.name },
    metadata: changes(client.settings, values, images),
  });
  const saved = await getAppBranding(clientId);
  return { ok: true, settings: saved?.settings ?? client.settings, warnings };
}

export async function resetAppBrandingAction(clientId: string): Promise<{ ok: true } | Failure> {
  const { audit } = await adminActor();
  const client = await adminClient(clientId);
  if (!client.ok) return client;
  if (await resetAppBranding(clientId)) {
    await audit({
      action: "oauth_client.branding_reset",
      target: { type: "oauth_client", id: clientId, label: client.name },
    });
  }
  return { ok: true };
}
