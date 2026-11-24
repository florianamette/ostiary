import { z } from "zod";

import { SECRET_GRACE_PERIODS, type SecretGracePeriod } from "@ostiary/core/lib/client-secret-grace";
import { ValidationError } from "@ostiary/core/lib/errors";
import { adminJsonRoute, requiredParam } from "@/lib/admin-json-route";
import { rotateOAuthClientSecretForAdmin } from "@/lib/oauth-client-admin.service";

const bodySchema = z
  .object({ grace: z.enum(Object.keys(SECRET_GRACE_PERIODS) as [SecretGracePeriod, ...SecretGracePeriod[]]).optional() })
  .strict();

/**
 * Issues a new secret for an admin-registered confidential client and returns it once.
 * An optional JSON body's `grace` keeps the previous secret working for a while (none, 1h, 24h
 * or 7d; none by default, and without a body).
 * Audited by the auth server's hook (`oauth_client.rotate_secret`).
 */
export const POST = adminJsonRoute<{ clientId: string }>({ body: "optional" }, async ({ params, body, requestHeaders }) => {
  const clientId = requiredParam(params.clientId, "client id");
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) throw new ValidationError("grace must be none, 1h, 24h or 7d");
  return { data: await rotateOAuthClientSecretForAdmin(requestHeaders, clientId, parsed.data.grace) };
});
