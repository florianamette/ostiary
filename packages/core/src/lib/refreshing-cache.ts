type CacheState<T> = { loadedAt: number; inFlight: Promise<T> | null; current: T };

/**
 * A value each instance reloads at most once per `refreshMs`, so a change made in the admin
 * console reaches every instance within that time. Concurrent requests share one load. The
 * state lives on globalThis under `globalKey`: bundlers and loaders may instantiate a module
 * more than once (Next.js server layers, tsx), and an admin change must reset the cache the
 * auth instance reads.
 */
export function refreshingCache<T>(options: {
  globalKey: string;
  refreshMs: number;
  initial: T;
  load: () => Promise<T>;
  /** Logged with the error when a load fails. */
  loadError: string;
}) {
  const globals = globalThis as unknown as Record<string, CacheState<T> | undefined>;
  const state = (globals[options.globalKey] ??= { loadedAt: 0, inFlight: null, current: options.initial });

  return {
    /** The cached value, reloaded first when it is older than `refreshMs`. */
    async get(): Promise<T> {
      if (Date.now() - state.loadedAt < options.refreshMs) return state.current;
      state.inFlight ??= options
        .load()
        .then((value) => {
          state.current = value;
          state.loadedAt = Date.now();
          return value;
        })
        .catch((error) => {
          // Keep serving the previous value (the initial one until a first successful load);
          // retry on the next request.
          console.error(options.loadError, error);
          return state.current;
        })
        .finally(() => {
          state.inFlight = null;
        });
      return state.inFlight;
    },
    /** Makes the next `get()` reload (after an admin change). */
    invalidate() {
      state.loadedAt = 0;
    },
  };
}
