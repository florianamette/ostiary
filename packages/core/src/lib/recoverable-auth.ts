/**
 * Better Auth starts initialising when the instance is created (plugin `init` hooks, some of
 * which query the database, such as the OAuth provider seeding its resources) and keeps that
 * promise for the life of the instance: if the database was unreachable at that moment, every
 * later request awaits the same rejected promise and fails with a 500 until the process
 * restarts. This wrapper notices the failure and builds a fresh instance on a later access,
 * at most once every `retryAfterMs`, so the app recovers by itself once the database is back.
 *
 * The returned object stands in for the instance: every property read (`api`, `handler`,
 * `$context`, …) is taken from the current one, so `auth.api.getSession()` and route handlers
 * built with `toNextJsHandler(auth)` reach the replacement without being rebuilt.
 */

type AuthLike = { $context: Promise<unknown> };

export type RecoverableAuthOptions = {
  /** Minimum time between two rebuilds after a failure (default 5 s). */
  retryAfterMs?: number;
  /** Clock, for tests. */
  now?: () => number;
  /** Logs a failed initialisation (default console.error). */
  onError?: (error: unknown) => void;
};

export function recoverableAuth<T extends AuthLike>(create: () => T, options: RecoverableAuthOptions = {}): T {
  const retryAfterMs = options.retryAfterMs ?? 5_000;
  const now = options.now ?? Date.now;
  const onError =
    options.onError ??
    ((error: unknown) =>
      console.error("[auth] Initialisation failed (database unreachable?); a new attempt follows on a later request.", error));

  let current: T;
  let failedAt: number | null = null;

  function build(): T {
    const instance = create();
    failedAt = null;
    // Handled here, so a failed start is not also an unhandled rejection.
    instance.$context.catch((error: unknown) => {
      if (current !== instance) return;
      failedAt = now();
      onError(error);
    });
    return instance;
  }

  function instance(): T {
    if (failedAt !== null && now() - failedAt >= retryAfterMs) current = build();
    return current;
  }

  current = build();

  return new Proxy({} as T, {
    get: (_target, property) => {
      const target = instance();
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has: (_target, property) => Reflect.has(instance(), property),
    ownKeys: () => Reflect.ownKeys(instance()),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(instance(), property);
      // The proxy target is an empty object: report properties as configurable.
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
