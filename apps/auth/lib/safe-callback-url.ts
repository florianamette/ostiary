/**
 * Only follow callbacks to this app or the admin app. The passkey and two-factor paths
 * navigate on the client, so without this check a crafted link could send a fresh session
 * elsewhere.
 */
export function safeCallbackURL(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw
  try {
    const target = new URL(raw)
    const allowed = [
      typeof window === "undefined" ? undefined : window.location.origin,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_ADMIN_APP_URL,
    ]
      .filter((o): o is string => Boolean(o))
      .map((o) => new URL(o).origin)
    return allowed.includes(target.origin) ? raw : fallback
  } catch {
    return fallback
  }
}
