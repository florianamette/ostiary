/** Applies `strip` until nothing changes, so a removal cannot leave a new match behind. */
export function stripRepeatedly(text: string, strip: (text: string) => string): string {
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = strip(text);
  }
  return text;
}
