/** OAuth client admin API, domain types (aligned with Better Auth admin OAuth endpoints). */

export type TokenEndpointAuthMethod =
  | "none"
  | "client_secret_basic"
  | "client_secret_post";

export type OAuthClientApplicationType = "web" | "native" | "user-agent-based";

export type OAuthGrantType =
  | "authorization_code"
  | "client_credentials"
  | "refresh_token";

export type CreateOAuthClientAdminInput = {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  grant_types: OAuthGrantType[];
  /** ["code"] with the authorization_code grant, [] for machine-only clients. */
  response_types: "code"[];
  type?: OAuthClientApplicationType;
  skip_consent: boolean;
  /** Space-separated scopes the client may request. */
  scope?: string;
};

/**
 * PATCH body for an OAuth client. Keys reflect fields present in the request
 * (`in`); at least one must be set (see validation).
 */
export type UpdateOAuthClientAdminInput = {
  client_name?: string;
  redirect_uris?: string[];
  skip_consent?: boolean;
};

export type OAuthClientAdminPayload = Record<string, unknown>;
