import { createAppAuthClient } from "@ostiary/core/lib/auth-client-factory";

function clientBaseURL(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  return raw.replace(/\/$/, "");
}

export const authClient = createAppAuthClient(clientBaseURL());
