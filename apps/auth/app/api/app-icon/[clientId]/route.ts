import { headers } from "next/headers";

import { appIconResponse, getAppIconForClient } from "@ostiary/core/lib/app-icons/store";
import { clientRegistrationSource } from "@ostiary/core/lib/client-registration";
import { auth } from "@/lib/auth";
import { userMaySeeAppIcon } from "@/lib/connected-apps";

export const dynamic = "force-dynamic";

/**
 * An OAuth app's icon, looked up and cached by this server (see lib/app-icons), so the
 * user's browser never contacts the app's site or a third-party favicon service. Signed-in
 * users only, for an app they are connected to or one registered by an admin.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });

  const source = await clientRegistrationSource(clientId);
  if (!source || !(await userMaySeeAppIcon(session.user.id, clientId, source === "admin"))) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return appIconResponse(await getAppIconForClient(clientId));
}
