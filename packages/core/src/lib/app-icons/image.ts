/*
 * What kind of image a downloaded icon really is, from its first bytes. The type sent to the
 * browser is the sniffed one, never the remote server's: a page or script labelled image/png
 * is refused.
 */

export type IconType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | "image/x-icon"
  | "image/svg+xml";

export function sniffImageType(bytes: Uint8Array): IconType | null {
  const b = bytes;
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  // ICO (type 1) and CUR (type 2) directories.
  if (b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) return "image/x-icon";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "image/avif";
  if (looksLikeSvg(b)) return "image/svg+xml";
  return null;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const start = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  if (!start.startsWith("<")) return false;
  // An XML prolog, comments or a doctype may come first; the root element must be <svg>.
  const withoutProlog = start
    .replace(/^<\?xml[\s\S]*?\?>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE\s+svg\b[^>]*>/i, "")
    .trimStart();
  return /^<svg[\s>]/i.test(withoutProlog);
}

/** Whether a remote Content-Type header may be an image (the bytes are sniffed anyway). */
export function isImageContentType(header: string | undefined): boolean {
  const type = (header ?? "").split(";")[0]!.trim().toLowerCase();
  return type.startsWith("image/");
}
