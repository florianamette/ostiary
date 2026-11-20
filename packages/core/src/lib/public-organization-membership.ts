import { randomUUID } from "node:crypto";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";

/**
 * Makes new accounts members of the Public organization, the default B2C workspace every
 * account belongs to. Used when Better Auth creates an account (database-hooks.ts) and by the
 * user import, which writes accounts itself. Accounts already in it are left alone.
 */
export async function joinPublicOrganization(database: Database, userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  const createdAt = new Date();
  await database
    .insert(schema.member)
    .values(
      userIds.map((userId) => ({
        id: randomUUID(),
        organizationId: PUBLIC_ORGANIZATION_ID,
        userId,
        role: "member",
        createdAt,
      })),
    )
    .onConflictDoNothing({ target: [schema.member.userId, schema.member.organizationId] });
}
