import { toNextJsHandler } from "better-auth/next-js";

import { withRateLimitHeaders } from "@ostiary/core/lib/rate-limit";
import { auth } from "@/lib/auth";

/**
 * The admin UI calls Better Auth from its own origin. Only the endpoints it uses are
 * exposed. Sign-in, the OIDC protocol endpoints and SSO callbacks stay on the auth app.
 */
const ALLOWED_PATHS = new Set([
  "/get-session",
  "/sign-out",
  // User management (guarded by the admin plugin's role check)
  "/admin/list-users",
  "/admin/get-user",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/impersonate-user",
  // Organizations: creation is restricted server-side to admins
  "/organization/list",
  "/organization/check-slug",
  "/organization/create",
  "/organization/get-full-organization",
  "/organization/list-members",
  "/organization/invite-member",
  "/organization/list-invitations",
  "/organization/cancel-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
  // OAuth clients and consents
  "/oauth2/get-clients",
  "/oauth2/get-client",
  "/oauth2/delete-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/get-consents",
  "/oauth2/get-consent",
  "/oauth2/update-consent",
  "/oauth2/delete-consent",
  // Enterprise SSO: registering an OIDC provider. Everything else about providers goes through
  // the console's server actions; the IdP callback itself stays on the auth app.
  "/sso/register",
]);

const handlers = withRateLimitHeaders(toNextJsHandler(auth));

function notAllowed(request: Request): Response | null {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  return ALLOWED_PATHS.has(path) ? null : new Response("Not found", { status: 404 });
}

export async function GET(request: Request) {
  return notAllowed(request) ?? handlers.GET(request);
}

export async function POST(request: Request) {
  return notAllowed(request) ?? handlers.POST(request);
}
