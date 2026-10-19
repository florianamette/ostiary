import { auth } from "@/lib/auth";
import { withRateLimitHeaders } from "@ostiary/core/lib/rate-limit";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = withRateLimitHeaders(toNextJsHandler(auth));

// MCP (and other browser) clients self-register (RFC 7591 dynamic client registration) and may
// exchange tokens cross-origin from the browser, so the OAuth2 endpoints must be CORS-enabled — the
// discovery documents already are (lib/discovery-response.ts). Scope this to the `/oauth2/`
// endpoints ONLY; the sign-in, session and SCIM routes stay same-origin. `WWW-Authenticate` is
// exposed so a resource server's 401 is readable by the client walking the auth flow.
const OAUTH2_PATH = /\/oauth2\//;

function corsify(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const response = await handler(request);
    if (OAUTH2_PATH.test(new URL(request.url).pathname)) {
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
    }
    return response;
  };
}

export const GET = corsify(handlers.GET);
export const POST = corsify(handlers.POST);
export const { PUT, PATCH, DELETE } = handlers;

// Preflight for the cross-origin OAuth2 requests; other paths get a bare 204.
export function OPTIONS(request: Request): Response {
  if (!OAUTH2_PATH.test(new URL(request.url).pathname)) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization, mcp-protocol-version",
      "Access-Control-Max-Age": "86400",
    },
  });
}
