/** OAuth client admin API, domain types (aligned with Better Auth admin OAuth endpoints). */

export type TokenEndpointAuthMethod =
  | "none"
  | "client_secret_basic"
  | "client_secret_post";

export type OAuthClientApplicationType = "web" | "native" | "user-agent-based";

/** RFC 8628 device authorization grant (CLIs, TVs). Same value as Better Auth's constant. */
export const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export type OAuthGrantType =
  | "authorization_code"
  | "client_credentials"
  | "refresh_token"
  | typeof DEVICE_CODE_GRANT_TYPE;

/**
 * A machine-to-machine client: it gets tokens for itself (client_credentials) and signs no
 * user in (no authorization_code or device code grant), so it has no redirect URIs, device
 * sign-in or consent screen.
 */
export function isMachineClient(grantTypes: readonly string[] | null | undefined): boolean {
  if (!grantTypes?.includes("client_credentials")) return false;
  return !grantTypes.includes("authorization_code") && !grantTypes.includes(DEVICE_CODE_GRANT_TYPE);
}

export type CreateOAuthClientAdminInput = {
  /** Required with the authorization_code grant; empty for a client that signs no user in. */
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  grant_types: OAuthGrantType[];
  /** ["code"] with the authorization_code grant, [] for machine-only clients. */
  response_types: "code"[];
  type?: OAuthClientApplicationType;
  skip_consent: boolean;
  /**
   * RP-initiated logout: the app may call the end-session endpoint, and its ID tokens carry
   * `sid`. Off unless asked for.
   */
  enable_end_session: boolean;
  /** Where the end-session endpoint may send the user back to; only with `enable_end_session`. */
  post_logout_redirect_uris?: string[];
  /** The app's icon (https, public host); see `appIconSource`. */
  logo_uri?: string;
  /** Space-separated scopes the client may request. */
  scope?: string;
  /** APIs (resource identifiers) to link the client to, as on the APIs page. */
  resources: string[];
};

/**
 * PATCH body for an OAuth client. Keys reflect fields present in the request
 * (`in`); at least one must be set (see validation).
 */
export type UpdateOAuthClientAdminInput = {
  client_name?: string;
  redirect_uris?: string[];
  skip_consent?: boolean;
  /** Turns RP-initiated logout (the end-session endpoint, `sid` in ID tokens) on or off. */
  enable_end_session?: boolean;
  /** Post-logout redirect URIs; an empty list clears them. */
  post_logout_redirect_uris?: string[];
  /** Adds or removes the device code grant, other grants unchanged. */
  device_code?: boolean;
  /** The app's icon; null clears it (back to the site's icon or a monogram). */
  logo_uri?: string | null;
};

export type OAuthClientAdminPayload = Record<string, unknown>;
