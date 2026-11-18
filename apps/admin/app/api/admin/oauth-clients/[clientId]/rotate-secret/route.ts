import { adminJsonRoute, requiredParam } from "@/lib/admin-json-route";
import { rotateOAuthClientSecretForAdmin } from "@/lib/oauth-client-admin.service";

/**
 * Issues a new secret for an admin-registered confidential client and returns it once.
 * Audited by the auth server's hook (`oauth_client.rotate_secret`).
 */
export const POST = adminJsonRoute<{ clientId: string }>({}, async ({ params, requestHeaders }) => {
  const clientId = requiredParam(params.clientId, "client id");
  return { data: await rotateOAuthClientSecretForAdmin(requestHeaders, clientId) };
});
