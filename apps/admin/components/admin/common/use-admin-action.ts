"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-result";

/** A Better Auth client call's result: `{ data, error }`. */
type AuthClientResult = { error: { message?: string } | null; data?: unknown };

/**
 * What `run` accepts: a server action's ActionResult (or a bare `{ ok }`), a Better Auth client
 * result, or nothing.
 */
export type AdminActionOutcome = ActionResult<object> | { ok: boolean; error?: string } | AuthClientResult | void;

/** The error to show for `outcome`, or null when it succeeded. */
export function outcomeError(outcome: AdminActionOutcome, fallback: string): string | null {
  if (!outcome) return null;
  if ("ok" in outcome) return outcome.ok ? null : ("error" in outcome && outcome.error) || fallback;
  return outcome.error ? outcome.error.message || fallback : null;
}

/**
 * Runs an admin mutation behind a `busy` flag: a server action (ActionResult) or a Better Auth
 * client call (`{ error }`). A failure toasts its error, and anything thrown (a network error)
 * toasts the generic one; a success toasts `success` (if given), calls `onSuccess` and
 * refreshes: the page by default, `refresh` when it is a function (a list loaded in the
 * browser), nothing when false. `run` resolves to whether it succeeded.
 */
export function useAdminAction(
  onSuccess?: () => void,
  { refresh = true }: { refresh?: boolean | (() => void) } = {},
) {
  const router = useRouter();
  const tc = useTranslations("admin.common");
  const [busy, setBusy] = React.useState(false);

  async function run(
    action: () => Promise<AdminActionOutcome>,
    success?: string,
    errorFallback?: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const error = outcomeError(await action(), errorFallback ?? tc("unexpectedError"));
      if (error !== null) {
        toast.error(error);
        return false;
      }
      if (success) toast.success(success);
      onSuccess?.();
      if (typeof refresh === "function") refresh();
      else if (refresh) router.refresh();
      return true;
    } catch {
      toast.error(errorFallback ?? tc("unexpectedError"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, setBusy, run };
}

/** The `run` of useAdminAction, for dialogs that take it from their parent. */
export type AdminActionRun = ReturnType<typeof useAdminAction>["run"];
