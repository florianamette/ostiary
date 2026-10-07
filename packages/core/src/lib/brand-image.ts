import { logoMarkSvg } from "@ostiary/core/lib/brand";

/** Server only: the mark as a data URI, for `<img>` inside ImageResponse (Satori). */
export function logoMarkDataUri(options?: Parameters<typeof logoMarkSvg>[0]) {
  return `data:image/svg+xml;base64,${Buffer.from(logoMarkSvg(options)).toString("base64")}`;
}
