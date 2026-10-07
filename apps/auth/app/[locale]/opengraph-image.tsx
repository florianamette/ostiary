import { renderOgImage, ogSize } from "@/lib/og";
import { brand } from "@ostiary/core/lib/brand";
import { getBaseURL } from "@ostiary/core/lib/url";

export const runtime = "nodejs";
export const alt = `${brand.name}: ${brand.tagline}`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    title: brand.tagline,
    description: brand.description,
    host: new URL(getBaseURL()).host.replace(/^www\./, ""),
  });
}
