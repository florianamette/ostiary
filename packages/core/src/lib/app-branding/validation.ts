import { sniffImageType, type IconType } from "@ostiary/core/lib/app-icons/image";
import { appIconSource } from "@ostiary/core/lib/app-icons/site";
import { normalizeHexColor } from "@ostiary/core/lib/app-branding/color";

/* Checks on what an admin enters in the Branding dialog. Pure, shared with the tests. */

export const LOGO_SOURCES = ["app_icon", "url", "upload"] as const;
export type LogoSource = (typeof LOGO_SOURCES)[number];

export const BRANDING_LIMITS = {
  displayName: 60,
  tagline: 120,
  panelText: 160,
  /** Same cap as fetched icons. */
  logoBytes: 256 * 1024,
  panelImageBytes: 1024 * 1024,
  socialProviders: 20,
} as const;

/** Raster formats only for the side-panel image: it is drawn large, an SVG brings nothing. */
const PANEL_IMAGE_TYPES: readonly IconType[] = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export type BrandingInput = {
  displayName?: string | null;
  tagline?: string | null;
  accentColor?: string | null;
  logoSource?: string | null;
  logoUrl?: string | null;
  panelText?: string | null;
  /** null or absent: every enabled provider. */
  socialProviders?: string[] | null;
};

export type BrandingValues = {
  displayName: string | null;
  tagline: string | null;
  accentColor: string | null;
  logoSource: LogoSource;
  logoUrl: string | null;
  panelText: string | null;
  socialProviders: string[] | null;
};

/**
 * Why a branding input was refused: `error` in English (logs, tests) and `code` with its
 * `values`, for the admin console to show in the admin's language.
 */
export type BrandingIssue =
  | { code: "textTooLong"; values: { max: number } }
  | { code: "displayNameTooLong" | "taglineTooLong" | "panelTextTooLong"; values: { max: number } }
  | { code: "accentColor"; values: { example: string } }
  | { code: "logoSource" | "logoUrl" | "logoEmpty" | "logoTooLarge" | "logoType" | "panelImageEmpty" | "panelImageTooLarge" | "panelImageType"; values?: undefined };

export type ValidationFailure = { ok: false; error: string } & BrandingIssue;
export type ValidationResult<T> = { ok: true; value: T } | ValidationFailure;

const ACCENT_EXAMPLE = "#2563eb";

/** Trimmed single line without control characters; null when empty. */
export function cleanText(raw: string | null | undefined, max: number): ValidationResult<string | null> {
  if (raw == null) return { ok: true, value: null };
  // eslint-disable-next-line no-control-regex
  const value = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return { ok: true, value: null };
  if ([...value].length > max) return { ok: false, error: `Keep it under ${max} characters.`, code: "textTooLong", values: { max } };
  return { ok: true, value };
}

export function validateBrandingInput(
  input: BrandingInput,
  knownSocialProviders: readonly string[],
): ValidationResult<BrandingValues> {
  const displayName = cleanText(input.displayName, BRANDING_LIMITS.displayName);
  if (!displayName.ok) {
    return { ok: false, error: `Display name: ${displayName.error}`, code: "displayNameTooLong", values: { max: BRANDING_LIMITS.displayName } };
  }
  const tagline = cleanText(input.tagline, BRANDING_LIMITS.tagline);
  if (!tagline.ok) return { ok: false, error: `Tagline: ${tagline.error}`, code: "taglineTooLong", values: { max: BRANDING_LIMITS.tagline } };
  const panelText = cleanText(input.panelText, BRANDING_LIMITS.panelText);
  if (!panelText.ok) {
    return { ok: false, error: `Side panel text: ${panelText.error}`, code: "panelTextTooLong", values: { max: BRANDING_LIMITS.panelText } };
  }

  let accentColor: string | null = null;
  if (input.accentColor && input.accentColor.trim()) {
    accentColor = normalizeHexColor(input.accentColor);
    if (!accentColor) {
      return { ok: false, error: `Accent color: enter a hex color such as ${ACCENT_EXAMPLE}.`, code: "accentColor", values: { example: ACCENT_EXAMPLE } };
    }
  }

  const logoSource = (input.logoSource ?? "app_icon") as LogoSource;
  if (!LOGO_SOURCES.includes(logoSource)) return { ok: false, error: "Choose where the logo comes from.", code: "logoSource" };
  let logoUrl: string | null = null;
  if (logoSource === "url") {
    const source = appIconSource({ icon: input.logoUrl?.trim() ?? null });
    if (source?.kind !== "logo") {
      return { ok: false, error: "Logo URL: enter an https URL on a public host (default port).", code: "logoUrl" };
    }
    logoUrl = source.url;
  }

  let socialProviders: string[] | null = null;
  if (Array.isArray(input.socialProviders)) {
    const known = new Set(knownSocialProviders);
    socialProviders = [...new Set(input.socialProviders)].filter((id) => known.has(id)).slice(0, BRANDING_LIMITS.socialProviders);
  }

  return {
    ok: true,
    value: {
      displayName: displayName.value,
      tagline: tagline.value,
      accentColor,
      logoSource,
      logoUrl,
      panelText: panelText.value,
      socialProviders,
    },
  };
}

export type ValidImage = { contentType: IconType; data: Buffer };

/** An uploaded logo: any icon type (SVG included, served sandboxed), at most 256 KB. */
export function validateLogoUpload(bytes: Uint8Array): ValidationResult<ValidImage> {
  if (bytes.length === 0) return { ok: false, error: "The logo file is empty.", code: "logoEmpty" };
  if (bytes.length > BRANDING_LIMITS.logoBytes) return { ok: false, error: "The logo must be 256 KB or smaller.", code: "logoTooLarge" };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, error: "The logo must be a PNG, JPEG, GIF, WebP, AVIF, ICO or SVG image.", code: "logoType" };
  return { ok: true, value: { contentType: type, data: Buffer.from(bytes) } };
}

/** An uploaded side-panel image: PNG, JPEG, WebP or AVIF, at most 1 MB. */
export function validatePanelImageUpload(bytes: Uint8Array): ValidationResult<ValidImage> {
  if (bytes.length === 0) return { ok: false, error: "The side panel image is empty.", code: "panelImageEmpty" };
  if (bytes.length > BRANDING_LIMITS.panelImageBytes) return { ok: false, error: "The side panel image must be 1 MB or smaller.", code: "panelImageTooLarge" };
  const type = sniffImageType(bytes);
  if (!type || !PANEL_IMAGE_TYPES.includes(type)) {
    return { ok: false, error: "The side panel image must be a PNG, JPEG, WebP or AVIF image.", code: "panelImageType" };
  }
  return { ok: true, value: { contentType: type, data: Buffer.from(bytes) } };
}
