import { NextResponse } from "next/server";

import { assertAdminWriteRateLimit } from "@ostiary/core/lib/api/admin-write-rate-limit";
import { handleError, ValidationError } from "@ostiary/core/lib/errors";
import { rotateOAuthClientSecretForAdmin } from "@/lib/oauth-client-admin.service";
import { requireAdminApiRequest } from "@/lib/require-admin-api-request";

type RouteContext = { params: Promise<{ clientId: string }> };

/**
 * Issues a new secret for an admin-registered confidential client and returns it once.
 * Audited by the auth server's hook (`oauth_client.rotate_secret`).
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const authz = await requireAdminApiRequest();
    if (!authz.ok) {
      return NextResponse.json({ error: authz.message }, { status: authz.status });
    }
    const { clientId } = await context.params;
    if (!clientId?.trim()) {
      throw new ValidationError("Missing client id");
    }
    assertAdminWriteRateLimit(req);
    const data = await rotateOAuthClientSecretForAdmin(authz.requestHeaders, clientId);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { message, statusCode } = handleError(error);
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
