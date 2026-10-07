/** Social sign-in providers, in display order. Safe to import in the browser. */
export const SOCIAL_PROVIDERS = ["github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  github: "GitHub",
};

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}
