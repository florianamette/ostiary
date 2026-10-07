import { env } from "@ostiary/core/lib/env";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function getBaseURL(): string {
  if (env.BETTER_AUTH_URL) {
    return trimTrailingSlash(env.BETTER_AUTH_URL);
  }
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return trimTrailingSlash(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (
    (env.VERCEL_ENV === "development" || env.VERCEL_ENV === "preview") &&
    env.VERCEL_URL
  ) {
    return trimTrailingSlash(`https://${env.VERCEL_URL}`);
  }
  const port = env.PORT ?? "3000";
  return trimTrailingSlash(`http://localhost:${port}`);
}

/** Origins allowed as callbackURL and for state-changing requests across the monorepo. */
export function getTrustedOrigins(): string[] {
  const origins = [getBaseURL(), env.AUTH_APP_URL, env.ADMIN_APP_URL]
    .filter((o): o is string => Boolean(o))
    .map(trimTrailingSlash);
  return [...new Set(origins)];
}
