import type * as React from "react";

import { PROVIDER_MARKS } from "@ostiary/core/components/brand/social-provider-marks";
import { cn } from "@ostiary/core/lib/utils";

/**
 * A sign-in provider's brand mark, in its colours. Near-black marks (GitHub, X, Apple...) follow
 * the text colour, so they turn white in dark mode; dark brand colours get a lighter tint there.
 * Providers without a mark get a monogram. Decorative: the button or row carries the name.
 */
export function SocialProviderIcon({
  provider,
  name,
  className,
}: {
  provider: string;
  /** For the monogram when there is no mark. */
  name?: string;
  className?: string;
}) {
  const mark = PROVIDER_MARKS[provider];
  if (!mark) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={cn("shrink-0", className)}>
        <rect width="24" height="24" rx="6" fill="currentColor" opacity="0.14" />
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill="currentColor"
        >
          {(name ?? provider).charAt(0).toUpperCase()}
        </text>
      </svg>
    );
  }
  return (
    <svg
      viewBox={mark.viewBox ?? "0 0 24 24"}
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {mark.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.fill ?? "currentColor"}
          style={path.darkFill ? ({ "--mark-dark": path.darkFill } as React.CSSProperties) : undefined}
          className={path.darkFill ? "dark:fill-(--mark-dark)" : undefined}
          stroke={mark.outline ? "rgb(0 0 0 / 0.35)" : undefined}
          strokeWidth={mark.outline ? 0.6 : undefined}
          paintOrder={mark.outline ? "stroke" : undefined}
        />
      ))}
    </svg>
  );
}
