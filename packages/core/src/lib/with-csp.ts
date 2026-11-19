import { NextRequest, NextResponse } from "next/server";

import { contentSecurityPolicy, createCspNonce, NONCE_HEADER, type CspOptions } from "@ostiary/core/lib/csp";

type Route = (request: NextRequest) => Promise<NextResponse> | NextResponse;

/**
 * Wraps an app's proxy: every page gets a fresh nonce and the CSP that carries it (csp.ts), on
 * the response and on the request, where Next.js reads it to put the nonce on its scripts.
 * `options` adds the page's extra sources (captcha, Google One Tap).
 */
export function withCsp(
  route: Route,
  options: (request: NextRequest) => Omit<CspOptions, "nonce" | "dev"> = () => ({}),
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const nonce = createCspNonce();
    const csp = contentSecurityPolicy({
      ...options(request),
      nonce,
      dev: process.env.NODE_ENV === "development",
    });
    // next-intl forwards a copy of these request headers to the page.
    request.headers.set(NONCE_HEADER, nonce);
    request.headers.set("content-security-policy", csp);
    const response = await route(request);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };
}
