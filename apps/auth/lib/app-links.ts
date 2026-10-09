import { APP_CONTEXT_PARAM } from "@ostiary/core/lib/app-branding/constants";
import { resolveSafeRedirect } from "@ostiary/core/lib/safe-redirect";
import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta";

/*
 * Links between sign-in screens during an app's sign-in. The signed OAuth request stays on
 * the screens Better Auth sends it to (login, two-factor, consent); sign-up and password reset
 * get the app context token and the path that restarts the request, as `callbackURL`, so the
 * flow continues after the email step and the screens keep the app's look.
 */

/** What a form needs to link onward: from AuthScreenApp, safe to pass to client components. */
export type AppLink = { token: string; resumePath: string } | null;

/** `path` with the app context (`app=` and `callbackURL=`) and any `extra` parameters. */
export function withAppContext(path: string, app: AppLink, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (app) {
    params.set(APP_CONTEXT_PARAM, app.token);
    params.set("callbackURL", app.resumePath);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * The app context carried by the current page's query, for screens reached from an email
 * link (reset password) or a redirect: the same two parameters, or null when absent.
 */
export function appLinkFromQuery(params: URLSearchParams): AppLink {
  const token = params.get(APP_CONTEXT_PARAM);
  // A path on this app only (the resume path always is one): never another site.
  const raw = params.get("callbackURL");
  const resumePath = resolveSafeRedirect(raw) ? raw : null;
  return token && resumePath ? { token, resumePath } : null;
}

/** The enabled social providers, narrowed to the ones the app's branding lists. */
export function appSocialProviders(
  providers: SocialProviderOption[],
  app: { verified: boolean; socialProviders: string[] | null } | null,
): SocialProviderOption[] {
  if (!app?.verified || !app.socialProviders) return providers;
  const shown = new Set(app.socialProviders);
  return providers.filter((provider) => shown.has(provider.id));
}

/** Whether the app's branding keeps a social provider (Google One Tap follows "google"). */
export function appShowsProvider(
  app: { verified: boolean; socialProviders: string[] | null } | null,
  providerId: string,
): boolean {
  return !app?.verified || !app.socialProviders || app.socialProviders.includes(providerId);
}
