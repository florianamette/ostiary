"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncResource<T> = {
  /** The last loaded value; `initialData` until the first load, else undefined. */
  data: T | undefined;
  /** True while a load runs. Not set for a reload while data is shown, to avoid flashing. */
  loading: boolean;
  /** What the last load threw, or null. */
  error: unknown;
  /** Loads again (after a change). Resolves when done; never throws. */
  reload: () => Promise<void>;
};

/**
 * Data a client component loads after it renders: the list of passkeys, sessions, API keys.
 * Loads on mount and whenever `load` changes (wrap it in useCallback with its inputs), drops
 * answers that come back after a newer load started, and keeps the previous data while
 * reloading. With `initialData` (read by a server component), the first load is skipped.
 *
 * `load` throws to report a failure; for a Better Auth call, throw its `error`.
 */
export function useAsyncResource<T>(
  load: () => Promise<T>,
  options: { initialData?: T } = {},
): AsyncResource<T> {
  const hasInitial = options.initialData !== undefined;
  const [data, setData] = useState<T | undefined>(options.initialData);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState<unknown>(null);
  // Each load gets a number; only the latest one may set state.
  const latest = useRef(0);
  const skipFirst = useRef(hasInitial);

  const run = useCallback(
    async (showLoading: boolean) => {
      const id = ++latest.current;
      if (showLoading) setLoading(true);
      try {
        const value = await load();
        if (id !== latest.current) return;
        setData(value);
        setError(null);
      } catch (failure) {
        if (id !== latest.current) return;
        setError(failure);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void run(true);
    const counter = latest;
    return () => {
      // Unmounted or `load` changed: a pending answer is stale.
      counter.current++;
    };
  }, [run]);

  const reload = useCallback(() => run(false), [run]);
  return { data, loading, error, reload };
}
