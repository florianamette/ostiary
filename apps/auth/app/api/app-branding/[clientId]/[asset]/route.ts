import { getAppBrandingAsset } from "@ostiary/core/lib/app-branding/store";
import { appIconResponse } from "@ostiary/core/lib/app-icons/store";

export const dynamic = "force-dynamic";

/**
 * An app's sign-in branding images (logo, side-panel image), served by Ostiary so the sign-in
 * page never loads anything from the app's servers. Public, since the sign-in page is: only
 * for enabled clients registered by an admin; anything else is a 404. Logos given as a URL
 * are fetched and cached like app icons (SSRF guard, sniffed type, sandboxed SVG).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; asset: string }> }) {
  const { clientId, asset } = await params;
  if (asset !== "logo" && asset !== "panel") {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const image = await getAppBrandingAsset(clientId, asset).catch((error: unknown) => {
    console.error("Could not load an app branding image", error);
    return null;
  });
  const response = appIconResponse(image);
  // Versioned URLs (?v=<updatedAt>) change with every save; shared caches may keep them.
  if (image) response.headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  return response;
}
