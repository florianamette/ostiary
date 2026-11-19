import * as React from "react";

const subscribeNever = () => () => {};

/**
 * The time to compare dates against ("last used 2 seconds ago", "expired"), read once in the
 * browser. Null on the server and during hydration, so both render the same text: a time read on
 * each side differs by the request's duration, and text that differs (a second later, a key that
 * just expired) makes hydration fail, which leaves the page's buttons dead. React renders again
 * with the time right after hydration.
 */
export function useClientNow(): Date | null {
  const [now] = React.useState(() => new Date());
  return React.useSyncExternalStore(subscribeNever, () => now, () => null);
}
