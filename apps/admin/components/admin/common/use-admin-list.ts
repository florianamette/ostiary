"use client";

import * as React from "react";

/**
 * Data an admin page loads in the browser (a Better Auth client call): `load` resolves to the
 * rows, or throws an Error whose message is shown. `reload` loads again, for instance after a
 * change; a newer load always wins over a slower older one.
 */
export function useAdminList<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = React.useState<T>(initial);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);
  const loadRef = React.useRef(load);

  React.useEffect(() => {
    loadRef.current = load;
  }, [load]);

  React.useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    loadRef.current().then(
      (rows) => {
        if (!current) return;
        setData(rows);
        setLoading(false);
      },
      (e: unknown) => {
        if (!current) return;
        setError(e instanceof Error && e.message ? e.message : String(e));
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [version]);

  const reload = React.useCallback(() => setVersion((v) => v + 1), []);
  return { data, loading, error, reload };
}
