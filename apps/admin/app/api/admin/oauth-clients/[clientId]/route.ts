import { NextResponse } from "next/server";

import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";

import { assertAdminWriteRateLimit } from "@ostiary/core/lib/api/admin-write-rate-limit";
import { assertRequestBodyWithinLimit } from "@ostiary/core/lib/api/request-body-limit";
import {
  parseUpdateOAuthClientBody,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
import { clientRegistrationSource } from "@ostiary/core/lib/client-registration";
import { updateOAuthClientForAdmin } from "@/lib/oauth-client-admin.service";
import { requireAdminApiRequest } from "@/lib/require-admin-api-request";
import { handleError, ValidationError } from "@ostiary/core/lib/errors";

type RouteContext = { params: Promise<{ clientId: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const authz = await requireAdminApiRequest();
    if (!authz.ok) {
      return NextResponse.json(
        { error: authz.message },
        { status: authz.status },
      );
    }

    const { clientId } = await context.params;
    if (!clientId?.trim()) {
      throw new ValidationError("Missing client id");
    }

    assertAdminWriteRateLimit(req);
    assertRequestBodyWithinLimit(req);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }

    const parsed = parseUpdateOAuthClientBody(raw);
    if (!parsed.ok) {
      throw new ValidationError(parsed.error);
    }

    // Self-registered clients are unreviewed: they always show the consent screen.
    if (parsed.value.skip_consent && (await clientRegistrationSource(clientId)) !== "admin") {
      throw new ValidationError("A self-registered client cannot skip the consent screen.");
    }

    const data = await updateOAuthClientForAdmin(
      authz.requestHeaders,
      clientId,
      parsed.value,
    );
    await recordAudit({
      actor: authz.actor,
      action: "oauth_client.update",
      target: { type: "oauth_client", id: clientId },
      metadata: { fields: Object.keys(parsed.value) },
      ipAddress: clientIp(authz.requestHeaders),
    });
    return NextResponse.json({ data });
  } catch (error) {
    const { message, statusCode } = handleError(error);
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
