"use client";

import * as React from "react";

import { authClient } from "@/lib/auth-client";

/** The parts of the session the dashboard sections read. Serializable: the layout passes it. */
export type DashboardSession = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    username: string | null;
    displayUsername: string | null;
    twoFactorEnabled: boolean;
  };
  session: {
    /** The session's id (not its token), to mark "this device" in the sessions list. */
    id: string;
    activeOrganizationId: string | null;
  };
};

type ContextValue = {
  data: DashboardSession;
  /** Reloads the session from the server, after a change the client does not track by itself. */
  refetch: () => Promise<void>;
};

const DashboardSessionContext = React.createContext<ContextValue | null>(null);

type LiveSession = NonNullable<ReturnType<typeof authClient.useSession>["data"]>;

function fromLive(live: LiveSession): DashboardSession {
  const user = live.user as LiveSession["user"] & {
    username?: string | null;
    displayUsername?: string | null;
    twoFactorEnabled?: boolean | null;
  };
  const session = live.session as LiveSession["session"] & { activeOrganizationId?: string | null };
  return {
    user: {
      id: user.id,
      name: user.name ?? "",
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      username: user.username ?? null,
      displayUsername: user.displayUsername ?? null,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
    },
    session: { id: session.id, activeOrganizationId: session.activeOrganizationId ?? null },
  };
}

/**
 * The signed-in session for the dashboard sections. Starts from the session the layout read on
 * the server, so the sections render complete on the first paint, then follows the Better Auth
 * client's session (which updates after a profile change, a new email, two-factor and so on).
 */
export function DashboardSessionProvider({
  initial,
  children,
}: {
  initial: DashboardSession;
  children: React.ReactNode;
}) {
  const live = authClient.useSession();
  const liveData = live.data;
  const data = React.useMemo(() => (liveData ? fromLive(liveData) : initial), [liveData, initial]);
  const { refetch: refetchLive } = live;
  const refetch = React.useCallback(async () => {
    await refetchLive();
  }, [refetchLive]);
  const value = React.useMemo(() => ({ data, refetch }), [data, refetch]);
  return <DashboardSessionContext.Provider value={value}>{children}</DashboardSessionContext.Provider>;
}

/** The dashboard's session; only inside DashboardSessionProvider (the dashboard layout). */
export function useDashboardSession(): ContextValue {
  const value = React.useContext(DashboardSessionContext);
  if (!value) throw new Error("useDashboardSession must be used inside DashboardSessionProvider");
  return value;
}
