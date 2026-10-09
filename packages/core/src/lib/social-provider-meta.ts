/**
 * Every Better Auth built-in social sign-in provider: its name, the credentials it needs and
 * where to create them. Safe to import in the browser (no secrets, no server code). The server
 * side (stored settings, the Better Auth options) is in social-providers.ts.
 */

/** Provider ids, as Better Auth names them (the `{id}` in `/api/auth/callback/{id}`). */
export const SOCIAL_PROVIDERS = [
  "apple",
  "atlassian",
  "cloudflare",
  "cognito",
  "discord",
  "dropbox",
  "facebook",
  "figma",
  "github",
  "gitlab",
  "google",
  "huggingface",
  "kakao",
  "kick",
  "line",
  "linear",
  "linkedin",
  "microsoft",
  "naver",
  "notion",
  "paybin",
  "paypal",
  "polar",
  "railway",
  "reddit",
  "roblox",
  "salesforce",
  "slack",
  "spotify",
  "tiktok",
  "twitch",
  "twitter",
  "vercel",
  "vk",
  "wechat",
  "zoom",
] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

/** What the sign-in and sign-up pages need to show Google One Tap (no secret). */
export type GoogleOneTapConfig = { clientId: string };

export type ProviderField = {
  /** Better Auth option name, except where the provider builds the option from several fields (Apple). */
  key: string;
  label: string;
  /** Stored encrypted and never sent back to the browser. */
  secret?: boolean;
  optional?: boolean;
  /** A text area (PEM private keys). */
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  /** A choice between fixed values; the first one is the default. */
  options?: readonly string[];
};

export type ProviderMeta = {
  id: SocialProvider;
  name: string;
  /** Wording on the button, per the brand's guidelines ("Sign in with Apple"). */
  button: "continue" | "signIn";
  fields: readonly ProviderField[];
  /** Where to create the OAuth app. */
  consoleUrl: string;
  /** Better Auth's setup guide for this provider. */
  docsUrl: string;
  /** Anything to know before setting it up. */
  note?: string;
};

const clientId = (label = "Client ID", hint?: string): ProviderField => ({ key: "clientId", label, hint });
const clientSecret = (label = "Client secret", optional = false, hint?: string): ProviderField => ({
  key: "clientSecret",
  label,
  secret: true,
  optional,
  hint,
});
const standard = [clientId(), clientSecret()] as const;

type Entry = Omit<ProviderMeta, "id" | "docsUrl" | "button" | "fields"> & {
  button?: ProviderMeta["button"];
  fields?: readonly ProviderField[];
  docsSlug?: string;
};

const ENTRIES: Record<SocialProvider, Entry> = {
  apple: {
    name: "Apple",
    button: "signIn",
    fields: [
      clientId("Services ID", "The identifier of a Services ID with Sign in with Apple turned on, e.g. com.example.signin."),
      { key: "teamId", label: "Team ID", placeholder: "ABCDE12345" },
      { key: "keyId", label: "Key ID", placeholder: "XYZ987WVU6", hint: "A key with Sign in with Apple enabled." },
      {
        key: "privateKey",
        label: "Private key (.p8)",
        secret: true,
        multiline: true,
        placeholder: "-----BEGIN PRIVATE KEY-----",
        hint: "The client secret is a JWT signed with this key; it is generated and renewed automatically.",
      },
      {
        key: "appBundleIdentifier",
        label: "App bundle ID",
        optional: true,
        hint: "Only for native iOS sign-in (ID tokens issued to your app instead of the Services ID).",
      },
    ],
    consoleUrl: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
    note: "Apple needs an HTTPS return URL on a real domain (no localhost) and sends the user back with a POST.",
  },
  atlassian: { name: "Atlassian", consoleUrl: "https://developer.atlassian.com/console/myapps/" },
  cloudflare: {
    name: "Cloudflare",
    fields: [clientId(), clientSecret("Client secret", true, "Leave empty for a public client (PKCE only).")],
    consoleUrl: "https://dash.cloudflare.com/profile",
  },
  cognito: {
    name: "Amazon Cognito",
    fields: [
      clientId("App client ID"),
      clientSecret("App client secret", true, "Only if the app client has a secret."),
      { key: "domain", label: "Cognito domain", placeholder: "your-app.auth.eu-west-1.amazoncognito.com" },
      { key: "region", label: "Region", placeholder: "eu-west-1" },
      { key: "userPoolId", label: "User pool ID", placeholder: "eu-west-1_AbCdEf123" },
    ],
    consoleUrl: "https://console.aws.amazon.com/cognito/v2/idp/user-pools",
  },
  discord: { name: "Discord", consoleUrl: "https://discord.com/developers/applications" },
  dropbox: { name: "Dropbox", fields: [clientId("App key"), clientSecret("App secret")], consoleUrl: "https://www.dropbox.com/developers/apps" },
  facebook: { name: "Facebook", fields: [clientId("App ID"), clientSecret("App secret")], consoleUrl: "https://developers.facebook.com/apps/" },
  figma: { name: "Figma", consoleUrl: "https://www.figma.com/developers/apps" },
  github: {
    name: "GitHub",
    consoleUrl: "https://github.com/settings/developers",
    note: "An OAuth App works as is. A GitHub App also needs the account permission Email addresses set to Read-only, or sign-in fails with no email.",
  },
  gitlab: {
    name: "GitLab",
    fields: [
      clientId("Application ID"),
      clientSecret(),
      { key: "issuer", label: "GitLab URL", optional: true, placeholder: "https://gitlab.com", hint: "For a self-managed GitLab." },
    ],
    consoleUrl: "https://gitlab.com/-/user_settings/applications",
  },
  google: {
    name: "Google",
    fields: [
      ...standard,
      {
        key: "hd",
        label: "Workspace domain",
        optional: true,
        placeholder: "example.com",
        hint: "Only accept accounts of this Google Workspace domain.",
      },
    ],
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
  },
  huggingface: { name: "Hugging Face", consoleUrl: "https://huggingface.co/settings/applications" },
  kakao: {
    name: "Kakao",
    fields: [clientId("REST API key"), clientSecret("Client secret", true, "Only if client secret is turned on for the app.")],
    consoleUrl: "https://developers.kakao.com/console/app",
  },
  kick: { name: "Kick", consoleUrl: "https://kick.com/settings/developer" },
  line: { name: "LINE", fields: [clientId("Channel ID"), clientSecret("Channel secret")], consoleUrl: "https://developers.line.biz/console/" },
  linear: { name: "Linear", consoleUrl: "https://linear.app/settings/api/applications/new" },
  linkedin: { name: "LinkedIn", consoleUrl: "https://www.linkedin.com/developers/apps" },
  microsoft: {
    name: "Microsoft",
    button: "signIn",
    fields: [
      clientId("Application (client) ID"),
      clientSecret("Client secret value"),
      {
        key: "tenantId",
        label: "Tenant",
        optional: true,
        placeholder: "common",
        hint: "common (any account), organizations, consumers, or your directory (tenant) ID to allow only your organization.",
      },
    ],
    consoleUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  },
  naver: { name: "Naver", consoleUrl: "https://developers.naver.com/apps/" },
  notion: {
    name: "Notion",
    fields: [clientId("OAuth client ID"), clientSecret("OAuth client secret")],
    consoleUrl: "https://www.notion.so/profile/integrations",
  },
  paybin: {
    name: "Paybin",
    fields: [...standard, { key: "issuer", label: "Issuer", optional: true, placeholder: "https://idp.paybin.io" }],
    consoleUrl: "https://paybin.io",
  },
  paypal: {
    name: "PayPal",
    fields: [...standard, { key: "environment", label: "Environment", options: ["live", "sandbox"] }],
    consoleUrl: "https://developer.paypal.com/dashboard/applications",
    note: "Turn on \"Log in with PayPal\" for the app and ask for the email address.",
  },
  polar: { name: "Polar", consoleUrl: "https://polar.sh/settings" },
  railway: { name: "Railway", consoleUrl: "https://railway.com/account" },
  reddit: { name: "Reddit", consoleUrl: "https://www.reddit.com/prefs/apps" },
  roblox: { name: "Roblox", consoleUrl: "https://create.roblox.com/dashboard/credentials" },
  salesforce: {
    name: "Salesforce",
    fields: [
      clientId("Consumer key"),
      clientSecret("Consumer secret"),
      { key: "environment", label: "Environment", options: ["production", "sandbox"] },
      {
        key: "loginUrl",
        label: "My Domain",
        optional: true,
        placeholder: "example.my.salesforce.com",
        hint: "Host name only. Replaces login.salesforce.com or test.salesforce.com.",
      },
    ],
    consoleUrl: "https://login.salesforce.com/lightning/setup/NavigationMenus/home",
  },
  slack: { name: "Slack", consoleUrl: "https://api.slack.com/apps" },
  spotify: { name: "Spotify", consoleUrl: "https://developer.spotify.com/dashboard" },
  tiktok: {
    name: "TikTok",
    fields: [{ key: "clientKey", label: "Client key" }, clientSecret()],
    consoleUrl: "https://developers.tiktok.com/apps/",
  },
  twitch: { name: "Twitch", consoleUrl: "https://dev.twitch.tv/console/apps" },
  twitter: {
    name: "X",
    fields: [clientId("OAuth 2.0 client ID"), clientSecret("OAuth 2.0 client secret")],
    consoleUrl: "https://developer.x.com/en/portal/dashboard",
    note: "Use the OAuth 2.0 credentials (not the API key) and ask for email access in the app's settings.",
  },
  vercel: { name: "Vercel", consoleUrl: "https://vercel.com/dashboard" },
  vk: { name: "VK", fields: [clientId("App ID"), clientSecret("Protected key")], consoleUrl: "https://id.vk.com/about/business/go" },
  wechat: {
    name: "WeChat",
    fields: [clientId("AppID"), clientSecret("AppSecret")],
    consoleUrl: "https://open.weixin.qq.com/",
    note: "Website application (QR code sign-in). WeChat returns no email address.",
  },
  zoom: { name: "Zoom", consoleUrl: "https://marketplace.zoom.us/develop/create" },
};

export const SOCIAL_PROVIDER_META: Record<SocialProvider, ProviderMeta> = Object.fromEntries(
  SOCIAL_PROVIDERS.map((id) => {
    const { docsSlug, button = "continue", fields = standard, ...entry } = ENTRIES[id];
    return [
      id,
      { id, button, fields, docsUrl: `https://www.better-auth.com/docs/authentication/${docsSlug ?? id}`, ...entry },
    ];
  }),
) as Record<SocialProvider, ProviderMeta>;

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = Object.fromEntries(
  SOCIAL_PROVIDERS.map((id) => [id, SOCIAL_PROVIDER_META[id].name]),
) as Record<SocialProvider, string>;

/** The return URL to register with the provider. */
export function socialCallbackUrl(authAppUrl: string, provider: SocialProvider): string {
  return `${authAppUrl.replace(/\/$/, "")}/api/auth/callback/${provider}`;
}

/** A provider offered on the sign-in page: its id and the name on its button. */
export type SocialProviderOption = { id: SocialProvider; name: string };
