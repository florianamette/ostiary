import { adminJsonRoute, requiredParam } from "@/lib/admin-json-route";
import { revokePreviousClientSecret } from "@/lib/oauth-client-admin.service";

/** Ends a secret rotation's grace period now: the previous secret stops working. */
export const DELETE = adminJsonRoute<{ clientId: string }>({}, async ({ params, audit }) => {
  const clientId = requiredParam(params.clientId, "client id");
  await revokePreviousClientSecret(clientId);
  await audit({ action: "oauth_client.revoke_previous_secret", target: { type: "oauth_client", id: clientId } });
  return { data: { ok: true } };
});
