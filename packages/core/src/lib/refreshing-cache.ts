type CacheState<T> = {
  loadedAt: number;
  /** Whether a load ever succeeded (until then, a failed load serves `fallback`). */
  loaded: boolean;
  /** Bumped by invalidate(): a load started before it does not count as fresh. */
  generation: number;
  inFlight: { promise: Promise<T>; generation: number } | null;
  current: T;
};

/**
 * A value each instance reloads at most once per `refreshMs`, so a change made in the admin
 * console reaches every instance within that time. Concurrent requests share one load. The
 * state lives on globalThis under `globalKey`: bundlers and loaders may instantiate a module
 * more than once (Next.js server layers, tsx), and an admin change must reset the cache the
 * auth instance reads.
 *
 * invalidate() during a load is not lost: that load's result is served to the requests already
 * waiting for it, but the next `get()` loads again, so it sees the admin's change.
 */
export function refreshingCache<T>(options: {
  globalKey: string;
  refreshMs: number;
  initial: T;
  load: () => Promise<T>;
  /** Served when a load fails before any has succeeded. Default: `initial`. */
  fallback?: () => T;
  /** Logged with the error when a load fails. */
  loadError: string;
}) {
  const globals = globalThis as unknown as Record<string, CacheState<T> | undefined>;
  const state = (globals[options.globalKey] ??= {
    loadedAt: 0,
    loaded: false,
    generation: 0,
    inFlight: null,
    current: options.initial,
  });
  // State left on globalThis by an older version of this module (development reloads).
  state.generation ??= 0;
  state.loaded ??= state.loadedAt > 0;

  function startLoad(): Promise<T> {
    const generation = state.generation;
    const promise = options
      .load()
      .then((value) => {
        state.current = value;
        state.loaded = true;
        // Fresh only if nothing was invalidated meanwhile.
        if (state.generation === generation) state.loadedAt = Date.now();
        return value;
      })
      .catch((error) => {
        // Keep serving the previous value (the fallback until a first successful load);
        // retry on the next request.
        console.error(options.loadError, error);
        return state.loaded || !options.fallback ? state.current : options.fallback();
      })
      .finally(() => {
        if (state.inFlight?.promise === promise) state.inFlight = null;
      });
    state.inFlight = { promise, generation };
    return promise;
  }

  return {
    /** The cached value, reloaded first when it is older than `refreshMs` or was invalidated. */
    async get(): Promise<T> {
      if (state.loaded && Date.now() - state.loadedAt < options.refreshMs) return state.current;
      // Share a load in progress, unless it started before the last invalidate().
      if (state.inFlight && state.inFlight.generation === state.generation) return state.inFlight.promise;
      return startLoad();
    },
    /** Makes the next `get()` reload (after an admin change), even if a load is in progress. */
    invalidate() {
      state.generation++;
      state.loadedAt = 0;
    },
  };
}
