/**
 * Product identity, in one place. Rebrand Ostiary by editing this file (and
 * `public/logo.*` via `pnpm --filter @ostiary/auth brand:assets`).
 *
 * Used where CSS variables can't reach: generated images (favicon, apple-icon,
 * Open Graph cards), emails, the web manifest and the browser `theme-color`.
 * The UI itself is themed by `styles/globals.css`.
 */
export const brand = {
  /** Product name: wordmark, page titles, emails, social cards. */
  name: "Ostiary",
  /** Headline on the sign-in screens and the social card. */
  tagline: "One account for all your apps.",
  /** Part of the tagline set in the serif italic accent (must appear in `tagline`). */
  taglineAccent: "all your apps",
  /** One sentence under the headline. */
  description: "Sign in once and reach every app connected to your identity provider.",
  /**
   * Apps that sign in through this provider, shown as chips on the sign-in
   * screen and the social card. Leave empty to hide them.
   */
  ecosystem: [] as readonly string[],
  /**
   * Ink, Bone and Brass: warm neutrals and the color of old keys and door fittings.
   * The UI tokens in styles/globals.css use the same values.
   */
  colors: {
    /** Primary dark: text, the logo tile, dark-mode ground. */
    ink: "#0C0B09",
    /** Light-mode ground, a warm off-white. */
    bone: "#F7F5F0",
    paper: "#FFFFFF",
    /** Signature accent: primary buttons, focus rings, the mark. */
    brass: "#D4A13A",
    /** Brass for text and links on light grounds (AA contrast). */
    brassDeep: "#8A6316",
    /** Dark-mode surfaces and text. */
    night: "#0C0B09",
    nightCard: "#141311",
    nightLine: "#26241F",
    nightText: "#9C978C",
    nightBody: "#EDE9E0",
    mist: "#F2EFE8",
    graphite: "#6E685D",
    line: "#E6E1D6",
  },
} as const;

/** Browser UI color (address bar, PWA title bar) per color scheme. */
export const themeColor = { light: brand.colors.bone, dark: brand.colors.night } as const;

/**
 * The mark on a 32×32 grid: an arched door with a keyhole cut through it (an ostiary
 * keeps the door). One even-odd path on a rounded tile: crisp down to 16 px.
 */
export const logoMark = {
  viewBox: "0 0 32 32",
  radius: 8,
  /** The arch, with the keyhole as a cut-out (fill-rule evenodd). */
  path:
    "M10 24.5V13.5a6 6 0 0 1 12 0v11Z" +
    "M16 12.4a2.2 2.2 0 0 1 1.05 4.13L17.6 20.1h-3.2l.55-3.57A2.2 2.2 0 0 1 16 12.4Z",
} as const;

/** Standalone SVG markup of the mark, for image routes and exported files. */
export function logoMarkSvg({
  background = brand.colors.ink,
  foreground = brand.colors.brass,
  size = 32,
  radius = logoMark.radius,
}: {
  background?: string;
  foreground?: string;
  size?: number;
  /** Corner radius on the 32-unit grid; 0 for platforms that mask icons (iOS). */
  radius?: number;
} = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${logoMark.viewBox}"><rect width="32" height="32" rx="${radius}" fill="${background}"/><path d="${logoMark.path}" fill="${foreground}" fill-rule="evenodd"/></svg>`;
}
