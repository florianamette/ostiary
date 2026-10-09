"use client";

import * as React from "react";

import { cn } from "@ostiary/core/lib/utils";

// Literal class names so Tailwind generates them. Soft tints that read in light and dark mode.
const MONOGRAM_COLORS = [
  "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
] as const;

/** Same name, same color: a small string hash (FNV-1a) picks the tint. */
export function monogramColor(name: string): string {
  let hash = 0x811c9dc5;
  for (const char of name.trim().toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return MONOGRAM_COLORS[(hash >>> 0) % MONOGRAM_COLORS.length]!;
}

/** First letter or digit of the name (a whole grapheme, so accents and emoji stay intact). */
export function monogramLetter(name: string): string {
  const trimmed = name.trim();
  const segments =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].map((s) => s.segment)
      : [...trimmed];
  const first = segments.find((s) => /[\p{L}\p{N}]/u.test(s)) ?? segments[0] ?? "?";
  return first.toLocaleUpperCase();
}

/**
 * An application's icon: the image at `src` (served by Ostiary, see lib/app-icons) over a
 * colored monogram, which stays visible while the image loads and when there is none.
 */
export function AppIcon({
  name,
  src,
  size = 40,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [state, setState] = React.useState<"loading" | "loaded" | "failed">("loading");
  const imgRef = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    // A cached image can finish before React attaches onLoad.
    const img = imgRef.current;
    setState(img?.complete && img.naturalWidth > 0 ? (img.naturalWidth > 1 ? "loaded" : "failed") : "loading");
  }, [src]);
  const showImage = Boolean(src) && state !== "failed";

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-[22%] font-semibold",
        state === "loaded" ? "bg-white ring-1 ring-border/70 dark:bg-white/95" : monogramColor(name),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
    >
      {state === "loaded" ? null : monogramLetter(name)}
      {showImage ? (
        // Same-origin route with its own CSP; never inline SVG markup.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src!}
          alt=""
          width={size}
          height={size}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            // A 1x1 tracking-style or broken image is no better than the monogram.
            const img = event.currentTarget;
            setState(img.naturalWidth > 1 ? "loaded" : "failed");
          }}
          onError={() => setState("failed")}
          className={cn(
            "absolute inset-0 size-full object-contain p-[14%] transition-opacity duration-200",
            state === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </span>
  );
}
