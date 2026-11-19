import { parseCreateOAuthClientBody } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
import { ValidationError } from "@ostiary/core/lib/errors";
import { currentApiScopes } from "@ostiary/core/lib/oauth-scopes";
import { adminJsonRoute } from "@/lib/admin-json-route";
import { createOAuthClientForAdmin } from "@/lib/oauth-client-admin.service";

/** Registers an OAuth client. The response carries its secret, once. */
export const POST = adminJsonRoute({ body: true }, async ({ body, requestHeaders, audit }) => {
  const parsed = parseCreateOAuthClientBody(body, await currentApiScopes());
  if (!parsed.ok) throw new ValidationError(parsed.error);

  const data = await createOAuthClientForAdmin(requestHeaders, parsed.value);
  const created = data as { client_id?: string; client_name?: string };
  await audit({
    action: "oauth_client.create",
    target: created.client_id
      ? { type: "oauth_client", id: created.client_id, label: created.client_name ?? null }
      : undefined,
  });
  return { data, status: 201 };
});
