import { NextResponse } from "next/server";

import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";

import { assertAdminWriteRateLimit } from "@ostiary/core/lib/api/admin-write-rate-limit";
import { assertRequestBodyWithinLimit } from "@ostiary/core/lib/api/request-body-limit";
import {
  parseCreateOAuthClientBody,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
import { currentApiScopes } from "@ostiary/core/lib/oauth-scopes";
import { createOAuthClientForAdmin } from "@/lib/oauth-client-admin.service";
import { requireAdminApiRequest } from "@/lib/require-admin-api-request";
import { handleError, ValidationError } from "@ostiary/core/lib/errors";

export async function POST(req: Request) {
  try {
    const authz = await requireAdminApiRequest();
    if (!authz.ok) {
      return NextResponse.json(
        { error: authz.message },
        { status: authz.status },
      );
    }

    assertAdminWriteRateLimit(req);
    assertRequestBodyWithinLimit(req);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }

    const parsed = parseCreateOAuthClientBody(raw, await currentApiScopes());
    if (!parsed.ok) {
      throw new ValidationError(parsed.error);
    }

    const data = await createOAuthClientForAdmin(
      authz.requestHeaders,
      parsed.value,
    );
    const created = data as { client_id?: string; client_name?: string };
    await recordAudit({
      actor: authz.actor,
      action: "oauth_client.create",
      target: created.client_id
        ? { type: "oauth_client", id: created.client_id, label: created.client_name ?? null }
        : undefined,
      ipAddress: clientIp(authz.requestHeaders),
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const { message, statusCode } = handleError(error);
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
