/**
 * Text that other users chose (an inviter's name, an organization's name) placed in an email
 * we send. The HTML layout escapes markup already; this keeps the text from passing for
 * something else:
 * - control characters (CR/LF in a subject line), Unicode bidirectional overrides and
 *   invisible characters are removed, whitespace is collapsed;
 * - link-like text is broken up so mail clients do not turn it into a link
 *   ("evil.example/login" reads "evil[.]example/login", "https://" loses its "://");
 * - it is cut to `max` characters, so a long name cannot push the real content out of view.
 */

/** C0/C1 controls, zero-width and bidi formatting characters, BOM, soft hyphen. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f­؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￹-￻]/g;

export function userText(value: string | null | undefined, fallback: string, max = 60): string {
  let text = (value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Schemes and "www." first, then any dot between two letters or digits ("example.com").
  text = text
    .replace(/\b([a-z][a-z0-9+.-]*):\/\//gi, "$1 ")
    .replace(/\bwww\./gi, "www[.]")
    .replace(/([\p{L}\p{N}])\.(?=[\p{L}\p{N}])/gu, "$1[.]")
    .replace(/@/g, "(at)");
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
  return text || fallback;
}
