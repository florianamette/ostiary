"use server";

import { z } from "zod";

import {
  loadAuthPolicy,
  MIN_PASSWORD_LENGTHS,
  saveAuthPolicy,
  SESSION_DAYS,
  type AuthPolicy,
} from "@ostiary/core/lib/auth-policy";

import { adminAction } from "@/lib/admin-action";

const policySchema = z
  .object({
    sessionDays: z.number().refine((v) => (SESSION_DAYS as readonly number[]).includes(v)),
    extendSessions: z.boolean(),
    signOutOnPasswordChange: z.boolean(),
    minPasswordLength: z.number().refine((v) => (MIN_PASSWORD_LENGTHS as readonly number[]).includes(v)),
    passwordSignUp: z.boolean(),
  })
  .strict();

type Result = { ok: true } | { ok: false; error: "invalid" | "save" };

/** Saves the session and password policy. The auth app applies it within a minute. */
export async function updateAuthPolicy(input: AuthPolicy): Promise<Result> {
  return adminAction(
    z.tuple([policySchema]),
    [input],
    async ([policy], { session, audit }): Promise<Result> => {
      let previous: AuthPolicy;
      try {
        previous = await loadAuthPolicy();
        await saveAuthPolicy(policy, session.user.id);
      } catch (error) {
        console.error("Could not save the session and password policy", error);
        return { ok: false, error: "save" };
      }
      await audit({ action: "security.update_policy", metadata: { ...policy, previous } });
      return { ok: true };
    },
    (): Result => ({ ok: false, error: "invalid" }),
  );
}
