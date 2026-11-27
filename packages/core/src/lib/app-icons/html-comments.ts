/**
 * Removes HTML comments the way a browser reads them: from `<!--` to the next `-->`, not
 * nested, and an unclosed one runs to the end of the text.
 */
export function removeHtmlComments(text: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const start = text.indexOf("<!--", from);
    if (start < 0) return out + text.slice(from);
    out += text.slice(from, start);
    const end = text.indexOf("-->", start + 4);
    if (end < 0) return out;
    from = end + 3;
  }
}
