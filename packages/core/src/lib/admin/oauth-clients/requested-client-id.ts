import { AsyncLocalStorage } from "node:async_hooks";
import { generateRandomString } from "better-auth/crypto";

/**
 * The client ID an admin chose for a new app (for apps moved from another provider, which keep
 * their ID). Better Auth takes no client ID on create, only a `generateClientId` hook: the admin
 * console runs its server-side create call inside `withRequestedClientId`, and the hook reads it.
 * Nothing that arrives over HTTP (Dynamic Client Registration included) can set it.
 */
const requested = new AsyncLocalStorage<string>();

export function withRequestedClientId<T>(clientId: string | undefined, create: () => Promise<T>): Promise<T> {
    return clientId ? requested.run(clientId, create) : create();
}

/** Better Auth's `generateClientId`: the requested ID, or Better Auth's default (32 letters). */
export function generateClientId(): string {
    return requested.getStore() ?? generateRandomString(32, "a-z", "A-Z");
}
