import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { adminActor } from "@/lib/admin-audit";

export type AdminActor = Awaited<ReturnType<typeof adminActor>>;

/**
 * For admin server actions. A server action is a public POST endpoint: its arguments are
 * whatever the request carries, not what the TypeScript signature says. This checks the caller
 * is an admin (adminActor), then checks the arguments against `schema`, and only then runs the
 * action with the parsed input. Arguments of the wrong shape return an error result, never a
 * 500 from calling `.trim()` on a number.
 *
 * Without `invalid`, the error is admin.common.invalidInput; actions whose errors are keys pass
 * their own.
 */
export async function adminAction<S extends z.ZodTypeAny, R>(
  schema: S,
  args: unknown,
  run: (input: z.output<S>, actor: AdminActor) => Promise<R>,
): Promise<R | { ok: false; error: string }>;
export async function adminAction<S extends z.ZodTypeAny, R>(
  schema: S,
  args: unknown,
  run: (input: z.output<S>, actor: AdminActor) => Promise<R>,
  invalid: () => R,
): Promise<R>;
export async function adminAction<S extends z.ZodTypeAny, R>(
  schema: S,
  args: unknown,
  run: (input: z.output<S>, actor: AdminActor) => Promise<R>,
  invalid?: () => R,
): Promise<R | { ok: false; error: string }> {
  const actor = await adminActor();
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    if (invalid) return invalid();
    return { ok: false, error: (await getTranslations("admin.common"))("invalidInput") };
  }
  return run(parsed.data, actor);
}

/** Argument shapes shared by the admin actions. */
export const input = {
  /** A row id, client id, provider id, identifier. */
  id: z.string().min(1).max(512),
  /** A short free-text field (names, slugs, domains). */
  text: z.string().max(1000),
  /** A longer text field (scope lists, host lists, metadata XML). */
  longText: z.string().max(200_000),
};
