import { Suspense } from "react";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";

import { AuthFormFallback } from "@/components/auth/auth-form-fallback";
import { AuthScreen } from "@/components/auth/auth-screen";
import {
  ConsentForm,
  type ConsentClient,
  type ConsentClientOrigin,
} from "@/components/auth/consent-form";
import { clientRegistrationSource } from "@ostiary/core/lib/client-registration";
import { authScreenApp } from "@/lib/app-context";
import { auth } from "@/lib/auth";

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

/**
 * The app's public fields (name, website, policy links), read here rather than from the
 * browser so the card renders complete. The endpoint needs a session: without one the card
 * asks the user to sign in.
 */
async function consentClient(clientId: string | undefined): Promise<ConsentClient> {
  if (!clientId) return { state: "missing" };
  try {
    const client = await auth.api.getOAuthClientPublic({
      query: { client_id: clientId },
      headers: await headers(),
    });
    return {
      state: "ok",
      client: {
        client_id: client.client_id,
        client_name: client.client_name ?? undefined,
        client_uri: client.client_uri ?? undefined,
        policy_uri: client.policy_uri ?? undefined,
        tos_uri: client.tos_uri ?? undefined,
      },
    };
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 401) return { state: "needsSignIn" };
    return { state: "failed" };
  }
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
  const clientId = first(query.client_id);
  const [origin, app, client] = await Promise.all([
    clientOrigin(clientId, first(query.redirect_uri)),
    // Colors and side panel only: the consent card names the app itself.
    authScreenApp(query),
    consentClient(clientId),
  ]);
  return (
    <AuthScreen locale={locale} app={app} appIntent="none">
      <Suspense fallback={<AuthFormFallback height="h-64" />}>
        <ConsentForm
          client={client}
          scopes={(first(query.scope) ?? "").split(/\s+/).filter(Boolean)}
          origin={origin}
          branded={app?.verified && app.clientId === clientId ? { name: app.name, logoUrl: app.logoUrl } : null}
        />
      </Suspense>
    </AuthScreen>
  );
}
