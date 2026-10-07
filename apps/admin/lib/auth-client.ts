import { createAppAuthClient } from "@ostiary/core/lib/auth-client-factory";

/** No base URL: the admin UI calls its own origin, which exposes the allowlisted auth routes. */
export const authClient = createAppAuthClient(undefined);
