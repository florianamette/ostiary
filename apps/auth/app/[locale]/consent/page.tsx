import { Suspense } from "react";

import { AuthFormFallback } from "@/components/auth/auth-form-fallback";
import { AuthScreen } from "@/components/auth/auth-screen";
import { ConsentForm, type ConsentClientOrigin } from "@/components/auth/consent-form";
import { clientRegistrationSource } from "@ostiary/core/lib/client-registration";
import { authScreenApp } from "@/lib/app-context";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

/**
 * How the client was registered decides the warning on the consent screen: a client that
 * registered itself (dynamic registration or a metadata document) was never reviewed by an
 * admin, so the screen says so, with where the user will be sent next.
 */
async function clientOrigin(clientId: string | undefined, redirectUri: string | undefined): Promise<ConsentClientOrigin | null> {
  if (!clientId) return null;
  const source = await clientRegistrationSource(clientId).catch(() => null);
  if (!source || source === "admin") return null;
  return {
    source,
    documentHost: source === "metadata_document" ? hostOf(clientId) : null,
    redirectHost: hostOf(redirectUri),
  };
}

export default async function ConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const [origin, app] = await Promise.all([
    clientOrigin(first(query.client_id), first(query.redirect_uri)),
    // Colors and side panel only: the consent card names the app itself.
    authScreenApp(query),
  ]);
  return (
    <AuthScreen locale={locale} app={app} appIntent="none">
      <Suspense fallback={<AuthFormFallback height="h-64" />}>
        <ConsentForm
          origin={origin}
          branded={app?.verified && app.clientId === first(query.client_id) ? { name: app.name, logoUrl: app.logoUrl } : null}
        />
      </Suspense>
    </AuthScreen>
  );
}
