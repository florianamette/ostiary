"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Drops the query string and fragment before a page view leaves the browser: sign-in URLs
 * carry reset and deletion tokens, OAuth parameters and signed app links.
 */
function withoutQuery(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  return { ...event, url: `${url.origin}${url.pathname}` };
}

/** Vercel Web Analytics, rendered by the root layouts when VERCEL_ANALYTICS=true. */
export function VercelAnalytics() {
  return <Analytics beforeSend={withoutQuery} />;
}
