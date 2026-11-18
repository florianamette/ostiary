import { parseUpdateOAuthClientBody } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
import { clientRegistrationSource } from "@ostiary/core/lib/client-registration";
import { ValidationError } from "@ostiary/core/lib/errors";
import { adminJsonRoute, requiredParam } from "@/lib/admin-json-route";
import { deleteOAuthClientForAdmin, updateOAuthClientForAdmin } from "@/lib/oauth-client-admin.service";

type Params = { clientId: string };

export const PATCH = adminJsonRoute<Params>({ body: true }, async ({ params, body, requestHeaders, audit }) => {
  const clientId = requiredParam(params.clientId, "client id");
  const parsed = parseUpdateOAuthClientBody(body);
  if (!parsed.ok) throw new ValidationError(parsed.error);

  // Self-registered clients are unreviewed: they always show the consent screen.
  if (parsed.value.skip_consent && (await clientRegistrationSource(clientId)) !== "admin") {
    throw new ValidationError("A self-registered client cannot skip the consent screen.");
  }

  const data = await updateOAuthClientForAdmin(requestHeaders, clientId, parsed.value);
  await audit({
    action: "oauth_client.update",
    target: { type: "oauth_client", id: clientId },
    metadata: { fields: Object.keys(parsed.value) },
  });
  return { data };
});

/**
 * Deletes an admin-registered client. Its tokens and consents go with it. Audited by the auth
 * server's hook (`oauth_client.delete`). Self-registered clients are deleted from the
 * Applications page's server action instead.
 */
export const DELETE = adminJsonRoute<Params>({}, async ({ params, requestHeaders }) => {
  const clientId = requiredParam(params.clientId, "client id");
  await deleteOAuthClientForAdmin(requestHeaders, clientId);
  return { data: { client_id: clientId } };
});
