import { appIconResponse, getAppIconForClient } from "@ostiary/core/lib/app-icons/store";
import { requireAdminApiRequest } from "@/lib/require-admin-api-request";

export const dynamic = "force-dynamic";

/** Any OAuth app's icon (see lib/app-icons), for the admin console: admins see every client. */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const gate = await requireAdminApiRequest();
  if (!gate.ok) return new Response(null, { status: gate.status, headers: { "cache-control": "no-store" } });
  const { clientId } = await params;
  return appIconResponse(await getAppIconForClient(clientId));
}
