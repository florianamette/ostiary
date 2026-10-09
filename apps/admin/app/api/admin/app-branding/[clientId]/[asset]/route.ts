import { getAppBrandingAsset } from "@ostiary/core/lib/app-branding/store";
import { appIconResponse } from "@ostiary/core/lib/app-icons/store";
import { requireAdminApiRequest } from "@/lib/require-admin-api-request";

export const dynamic = "force-dynamic";

/** An app's sign-in branding images (logo, side panel) for the Branding dialog's preview. */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; asset: string }> }) {
  const gate = await requireAdminApiRequest();
  if (!gate.ok) return new Response(null, { status: gate.status, headers: { "cache-control": "no-store" } });
  const { clientId, asset } = await params;
  if (asset !== "logo" && asset !== "panel") return new Response(null, { status: 404 });
  return appIconResponse(await getAppBrandingAsset(clientId, asset, { allowDisabled: true }));
}
