import { safeRedirectTarget } from "@ostiary/core/lib/safe-redirect"

/**
 * Only follow callbacks to this app or the admin app. The passkey and two-factor paths
 * navigate on the client, so without this check a crafted link could send a fresh session
 * elsewhere. Same check as the proxy's (packages/core/src/lib/safe-redirect.ts).
 */
export function safeCallbackURL(raw: string | null, fallback: string): string {
  return safeRedirectTarget(raw, fallback, {
    origin: typeof window === "undefined" ? process.env.NEXT_PUBLIC_APP_URL : window.location.origin,
    allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_ADMIN_APP_URL],
  })
}
