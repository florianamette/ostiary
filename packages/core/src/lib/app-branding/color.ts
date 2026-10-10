/*
 * Accent colors for per-application branding: parsing, WCAG 2.x contrast, and the derived
 * colors the sign-in screens use. Pure functions, shared by the admin console (live preview
 * and warnings) and the auth app (CSS variables).
 */

/** The surfaces an accent is drawn on, per color scheme (styles/globals.css). */
export const BRANDING_SURFACES = {
  light: { background: "#f7f5f0", card: "#ffffff" },
  dark: { background: "#0c0b09", card: "#141311" },
} as const;

/** WCAG AA: 4.5:1 for normal text, 3:1 for UI components and large text. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

const BLACK = "#000000";
const WHITE = "#ffffff";

/** `#abc`, `abc`, `#AABBCC` → `#aabbcc`; null for anything else. */
export function normalizeHexColor(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) return `#${[...value].map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  return null;
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance of an sRGB color. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Text color for labels on the accent (primary buttons): black or white, whichever contrasts
 * more. One of the two always reaches at least 4.58:1, so button labels always pass AA.
 */
export function readableForeground(accent: string): string {
  return contrastRatio(accent, BLACK) >= contrastRatio(accent, WHITE) ? BLACK : WHITE;
}

function mix(a: string, b: string, amount: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return toHex([0, 1, 2].map((i) => ca[i]! + (cb[i]! - ca[i]!) * amount) as [number, number, number]);
}

/**
 * The accent, darkened (on a light surface) or lightened (on a dark one) just enough to reach
 * `min` contrast with `surface`. Used for the accent as text, e.g. the app name.
 */
export function accentForSurface(accent: string, surface: string, min = AA_TEXT): string {
  if (contrastRatio(accent, surface) >= min) return accent;
  const target = relativeLuminance(surface) > 0.5 ? BLACK : WHITE;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (contrastRatio(mix(accent, target, mid), surface) >= min) high = mid;
    else low = mid;
  }
  return mix(accent, target, high);
}

export type AccentWarning =
  /** The accent is hard to tell from the light card (buttons, focus ring): below 3:1. */
  | "light_ui"
  /** Same on the dark card. */
  | "dark_ui";

export type AccentPalette = {
  accent: string;
  /** Label color on the accent. */
  foreground: string;
  foregroundContrast: number;
  light: { contrast: number; text: string; textAdjusted: boolean };
  dark: { contrast: number; text: string; textAdjusted: boolean };
  warnings: AccentWarning[];
};

/**
 * Everything the screens derive from an accent: the button label color, the accent as text
 * per color scheme (adjusted to 4.5:1 when needed) and warnings when the accent itself is
 * below 3:1 against a card, so a button would barely stand out from it.
 */
export function accentPalette(accent: string): AccentPalette {
  const foreground = readableForeground(accent);
  const scheme = (mode: "light" | "dark") => {
    const surface = BRANDING_SURFACES[mode].card;
    const text = accentForSurface(accent, surface);
    return { contrast: contrastRatio(accent, surface), text, textAdjusted: text !== accent };
  };
  const light = scheme("light");
  const dark = scheme("dark");
  const warnings: AccentWarning[] = [];
  if (light.contrast < AA_UI) warnings.push("light_ui");
  if (dark.contrast < AA_UI) warnings.push("dark_ui");
  return {
    accent,
    foreground,
    foregroundContrast: contrastRatio(accent, foreground),
    light,
    dark,
    warnings,
  };
}

/**
 * The CSS custom properties set on a branded screen (see `[data-app-brand]` in
 * styles/globals.css). Only these: a fork that restyles Ostiary keeps control of the rest.
 */
export function accentCssVariables(accent: string): Record<string, string> {
  const palette = accentPalette(accent);
  return {
    "--app-accent": palette.accent,
    "--app-accent-foreground": palette.foreground,
    "--app-accent-text-light": palette.light.text,
    "--app-accent-text-dark": palette.dark.text,
  };
}
