import { logoMarkSvg } from "@ostiary/core/lib/brand";

/**
 * Favicon, generated from the mark in `lib/brand.ts` so it never drifts from
 * the in-page logo. Served as SVG: crisp at every size, tiny payload.
 */
export const contentType = "image/svg+xml";

export default function Icon() {
  return new Response(logoMarkSvg(), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
