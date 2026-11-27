/*
 * A short, human name for a browser's User-Agent ("Chrome on macOS"), for emails and the
 * account page. Only the common browsers and systems are named; anything else is "Unknown".
 * Order matters: Edge and Opera say "Chrome", Chrome says "Safari", and Android says "Linux".
 */

const BROWSERS: [RegExp, string][] = [
    [/\bEdg(?:e|A|iOS)?\//, "Edge"],
    [/\b(?:OPR|Opera)\//, "Opera"],
    [/\bSamsungBrowser\//, "Samsung Internet"],
    [/\b(?:Firefox|FxiOS)\//, "Firefox"],
    [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
    [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
    [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
    [/\bAndroid\b/, "Android"],
    [/\bCrOS\b/, "ChromeOS"],
    [/\bWindows\b/, "Windows"],
    [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
    [/\bLinux\b/, "Linux"],
];

export type DeviceName = { browser: string | null; system: string | null };

export function describeUserAgent(userAgent: string | null | undefined): DeviceName {
    const ua = userAgent ?? "";
    return {
        browser: BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
        system: SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
    };
}
