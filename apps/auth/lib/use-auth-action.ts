"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useAuthErrorMessage, type AuthClientError, type ErrorCodeMessages } from "@/lib/auth-error-message";

type ActionOptions = {
  /** The call: a Better Auth client method, or a server action mapped to `{ error }`. */
  call: () => Promise<{ error?: AuthClientError | null }>;
  /** Toast on success. */
  success?: string;
  /** Toast for an error with no wording of its own. */
  error: string;
  /** The screen's wording for specific error codes. */
  codes?: ErrorCodeMessages;
  /** Handles an error itself (e.g. "sign in again"): return true to skip the toast. */
  onError?: (error: NonNullable<AuthClientError>) => boolean;
  /** After success: reload the list, close the dialog, refresh the page. */
  onSuccess?: () => void | Promise<void>;
};

/**
 * Runs a dashboard change: marks it pending (by a key, so one row or button shows the spinner),
 * calls it, then toasts success or a translated error. A call that throws (network failure)
 * gets the error toast too, and pending always ends. `run` resolves to whether it worked.
 */
export function useAuthAction<K extends string = string>() {
  const errorMessage = useAuthErrorMessage();
  const [pending, setPending] = useState<K | null>(null);

  const run = useCallback(
    async (key: K, options: ActionOptions): Promise<boolean> => {
      setPending(key);
      try {
        const { error } = await options.call();
        if (error) {
          if (!options.onError?.(error)) toast.error(errorMessage(error, options.error, options.codes));
          return false;
        }
        if (options.success) toast.success(options.success);
        await options.onSuccess?.();
        return true;
      } catch {
        toast.error(options.error);
        return false;
      } finally {
        setPending(null);
      }
    },
    [errorMessage],
  );

  return { pending, run };
}
