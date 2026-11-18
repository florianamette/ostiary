import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import type { Bag } from "@ostiary/core/lib/auth-hooks/values";

/** The verification state an admin's update leaves: unproven when the email actually changes. */
export function emailVerifiedAfterAdminUpdate(storedEmail: string, data: Bag): Bag {
  if (typeof data.email !== "string") return data;
  if (data.email.trim().toLowerCase() === storedEmail.trim().toLowerCase()) return data;
  return { ...data, emailVerified: false };
}

/**
 * An address an admin sets (admin console, `/admin/update-user`) is unproven: the account must
 * verify it at its next sign-in. Done in the same update as the change, and only when the
 * address really changes (saving a profile with the same address keeps it verified).
 */
export const adminEmailChangeUnverifies = {
  id: "ostiary-admin-email-change",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/admin/update-user",
        handler: createAuthMiddleware(async (ctx) => {
          const body = (ctx.body ?? {}) as Bag;
          const data = body.data as Bag | undefined;
          if (typeof body.userId !== "string" || !data || typeof data.email !== "string") return;
          const stored = await ctx.context.internalAdapter.findUserById(body.userId);
          if (!stored) return;
          const next = emailVerifiedAfterAdminUpdate(stored.email, data);
          if (next === data) return;
          return { context: { body: { ...body, data: next } } };
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;
