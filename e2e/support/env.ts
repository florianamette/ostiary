import { loadTestEnv } from "./load-env.mjs";

export const env = loadTestEnv();

function required(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set (e2e/.env.test)`);
  return value;
}

export const AUTH_URL = required("AUTH_APP_URL");
export const ADMIN_URL = required("ADMIN_APP_URL");
export const ISSUER = `${AUTH_URL}/api/auth`;
export const MOCK_PORT = Number(env.E2E_MOCK_PORT ?? 3229);
/** Mock servers (OAuth provider, webhook receiver, OAuth client callback), see mock-server.mjs. */
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
export const DATABASE_URL = required("DATABASE_URL");
export const BETTER_AUTH_SECRET = required("BETTER_AUTH_SECRET");
export const MAIL_FILE = required("E2E_MAIL_FILE");
export const ADMIN_EMAIL = (env.ADMIN_EMAILS ?? "").split(",")[0]!.trim();
/** A second admin address, for the two-factor gate (see ADMIN_EMAILS). */
export const GATE_ADMIN_EMAIL = (env.ADMIN_EMAILS ?? "").split(",")[1]?.trim() ?? "";
