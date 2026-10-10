import { NextResponse } from "next/server";

/**
 * A discovery document (OpenID configuration, OAuth server metadata) as JSON. In development
 * any origin may read it, and it is cached briefly.
 */
export function discoveryResponse(config: unknown): NextResponse {
  const headers = new Headers();
  if (process.env.NODE_ENV === "development") {
    headers.set("Access-Control-Allow-Methods", "GET");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400");
  }
  return NextResponse.json(config, { headers });
}
