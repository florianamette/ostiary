import { headers } from "next/headers";
import { cache } from "react";
import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { member } from "@ostiary/core/db/schema";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { auth } from "@/lib/auth";

/**
 * Session plus whether the user belongs to any organization besides the default Public
 * workspace. Every account is in Public, so the dashboard only shows organizations when
 * there is a real one. Cached per request so the layout and the page share one lookup.
 */
export const getDashboardContext = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, hasOrganizations: false };

  const [row] = await db
    .select({ n: count() })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        ne(member.organizationId, PUBLIC_ORGANIZATION_ID),
      ),
    );

  return { session, hasOrganizations: (row?.n ?? 0) > 0 };
});
