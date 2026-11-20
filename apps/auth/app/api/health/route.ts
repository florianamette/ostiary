import { databaseReachable } from "@ostiary/core/db/index";

/*
 * Health check for load balancers, uptime monitors and the Docker HEALTHCHECK: 200 when the
 * app runs and its database answers within 3 seconds, 503 otherwise. Public and unauthenticated,
 * so it says nothing else (no version, no error details).
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await databaseReachable();
  return Response.json(
    { status: ok ? "ok" : "unavailable" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
