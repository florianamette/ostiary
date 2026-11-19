"use client";

import { useEffect, useState } from "react";

import { orderDeviceAccounts, type DeviceAccount } from "@ostiary/core/lib/device-accounts";
import { authClient } from "@/lib/auth-client";

/**
 * Accounts signed in on this browser, the active one first. Read from the multi-session
 * cookies: a session created before multi-session was enabled has none and is not listed.
 * `null` while loading.
 */
export function useDeviceAccounts(activeUserId: string | undefined) {
  const [accounts, setAccounts] = useState<DeviceAccount[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    authClient.multiSession
      .listDeviceSessions()
      .then(({ data }) => data ?? [])
      // Unreadable (network error): list only the active account rather than load forever.
      .catch(() => [])
      .then((sessions) => {
        if (!cancelled) setAccounts(orderDeviceAccounts(sessions, activeUserId));
      });
    return () => {
      cancelled = true;
    };
  }, [activeUserId]);

  return accounts;
}
