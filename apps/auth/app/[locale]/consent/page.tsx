import { Suspense } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { ConsentForm, type ConsentClientOrigin } from "@/components/auth/consent-form";
import { clientRegistrationSource } from "@ostiary/core/lib/client-registration";

function ConsentFallback() {
  return <div className="h-64 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />;
}

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
  const origin = await clientOrigin(first(query.client_id), first(query.redirect_uri));
  return (
    <AuthScreen locale={locale}>
      <Suspense fallback={<ConsentFallback />}>
        <ConsentForm origin={origin} />
      </Suspense>
    </AuthScreen>
  );
}
