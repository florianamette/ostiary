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
const MOCK_PORT = Number(env.E2E_MOCK_PORT ?? 3229);
/** Mock server (GitLab-compatible OAuth provider, webhook receiver), see mock-server.mjs. */
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
export const DATABASE_URL = required("DATABASE_URL");
export const BETTER_AUTH_SECRET = required("BETTER_AUTH_SECRET");
export const MAIL_FILE = required("E2E_MAIL_FILE");

/** The ADMIN_EMAILS address at this position, "" when there is none. */
function adminEmail(index: number): string {
  return (env.ADMIN_EMAILS ?? "").split(",")[index]?.trim() ?? "";
}

/** The admin every admin-console test signs in as (tests/admin.setup.ts). */
export const ADMIN_EMAIL = adminEmail(0);
/** A second admin address, for the two-factor gate (admin-two-factor.spec.ts). */
export const GATE_ADMIN_EMAIL = adminEmail(1);
/** A third admin address, for social sign-ups (social.spec.ts). */
export const SOCIAL_ADMIN_EMAIL = adminEmail(2);
/** A fourth admin address, for a password sign-up promoted on verification (security-accounts.spec.ts). */
export const PENDING_ADMIN_EMAIL = adminEmail(3);
