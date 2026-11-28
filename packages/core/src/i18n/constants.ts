/**
 * The time zone dates are shown in: TZ, or UTC. POSIX allows a leading colon (`TZ=:UTC`, what
 * Vercel sets), which Intl refuses; an unknown zone falls back to UTC rather than making every
 * date format fail.
 */
export function appTimeZone(raw: string | undefined): string {
  const zone = raw?.trim().replace(/^:/, "");
  if (!zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

export const APP_TIME_ZONE = appTimeZone(typeof process !== "undefined" ? process.env.TZ : undefined);
