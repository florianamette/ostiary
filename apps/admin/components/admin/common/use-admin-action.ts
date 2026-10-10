"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Runs server actions behind a `busy` flag. A failure toasts its error; a success toasts
 * `success` (if given), calls `onSuccess` and refreshes the page.
 */
export function useAdminAction(onSuccess?: () => void) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run(action: () => Promise<ActionResult>, success?: string) {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (success) toast.success(success);
      onSuccess?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return { busy, setBusy, run };
}
