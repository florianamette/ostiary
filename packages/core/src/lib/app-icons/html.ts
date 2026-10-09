/*
 * Finds the icons a home page declares (`<link rel="icon">`, `apple-touch-icon`...) with a
 * small tag scanner: no DOM, no scripts, only the `<head>` part of the page matters.
 */

export type IconCandidate = { url: string; score: number };

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", "#39": "'", "#x27": "'", "#47": "/", "#x2f": "/" };

function decodeEntities(value: string): string {
  return value.replace(/&(#?[a-z0-9]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Attributes of one tag, names lowercased. */
export function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  // Skip the tag name.
  const body = tag.replace(/^<\s*[a-z]+/i, "").replace(/\/?>$/, "");
  for (const match of body.matchAll(pattern)) {
    const name = match[1]!.toLowerCase();
    if (name in attributes) continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

/** Largest square size in a `sizes` attribute (`"16x16 32x32"`, `"any"` counts as 512). */
function largestSize(sizes: string | undefined): number | null {
  if (!sizes) return null;
  let best: number | null = null;
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === "any") best = Math.max(best ?? 0, 512);
    const match = /^(\d+)x(\d+)$/.exec(token);
    if (match) best = Math.max(best ?? 0, Math.min(Number(match[1]), Number(match[2])));
  }
  return best;
}

function isSvg(href: string, type: string | undefined): boolean {
  return type?.toLowerCase() === "image/svg+xml" || /\.svg(?:[?#]|$)/i.test(href);
}

/**
 * How good an icon is for a 40 px tile shown on high-density screens: bigger is better up to
 * about 192 px, vector is as good as it gets, a 16 px favicon is the last resort.
 */
function scoreIcon(rel: string[], href: string, attributes: Record<string, string>): number {
  if (isSvg(href, attributes.type)) return 300;
  const size = largestSize(attributes.sizes);
  if (rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed")) {
    return size ?? 180;
  }
  if (size !== null) return size >= 512 ? 250 : size;
  // An `icon` without sizes is usually a 16/32 px .ico, sometimes a PNG of any size.
  return /\.ico(?:[?#]|$)/i.test(href) ? 16 : 32;
}

/**
 * Icon links of an HTML page, best first, as absolute URLs. Relative hrefs resolve against
 * `<base href>` when present, else the page URL. `mask-icon` (a one-color Safari pin) and
 * `data:` URLs are skipped.
 */
export function findIconLinks(html: string, pageUrl: string): IconCandidate[] {
  // The icons are in the head; don't scan a whole long page.
  const headEnd = html.search(/<\/head\s*>|<body[\s>]/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 256 * 1024);
  const withoutComments = head.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");

  let base = pageUrl;
  const baseTag = /<base\b[^>]*>/i.exec(withoutComments);
  if (baseTag) {
    const href = parseAttributes(baseTag[0]).href;
    if (href) {
      try {
        base = new URL(href, pageUrl).href;
      } catch {
        // Keep the page URL.
      }
    }
  }

  const found = new Map<string, number>();
  for (const match of withoutComments.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const isIcon = rel.includes("icon") || rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (!isIcon || rel.includes("mask-icon")) continue;
    const href = attributes.href?.trim();
    if (!href || /^data:/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    url.hash = "";
    const score = scoreIcon(rel, href, attributes);
    found.set(url.href, Math.max(found.get(url.href) ?? 0, score));
  }
  return [...found.entries()].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score);
}
