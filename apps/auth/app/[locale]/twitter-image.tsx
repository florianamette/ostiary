import { renderBrandOgImage, ogSize } from "@/lib/og";
import { brand } from "@ostiary/core/lib/brand";

export const runtime = "nodejs";
export const alt = `${brand.name}: ${brand.tagline}`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderBrandOgImage();
}
