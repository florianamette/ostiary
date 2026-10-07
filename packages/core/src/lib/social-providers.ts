import { env } from "@ostiary/core/lib/env";
import { SOCIAL_PROVIDERS, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";

/** Server only: Better Auth `socialProviders` config, with only the providers that have credentials. */
export function socialProvidersConfig() {
  return {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
  };
}

/** Server only: providers the UI should offer, i.e. the ones configured. */
export function enabledSocialProviders(): SocialProvider[] {
  const configured = socialProvidersConfig();
  return SOCIAL_PROVIDERS.filter((p) => p in configured);
}
