"use client";

import * as React from "react";
import { Loader2, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import { redeliverWebhook } from "@/app/[locale]/(console)/webhooks/actions";

/** Sends a delivery's event again, now, as a new delivery with the same event id. */
export function RedeliverButton({ deliveryId, disabled }: { deliveryId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const res = await redeliverWebhook(deliveryId);
      if (!res.ok) toast.error(res.error);
      else if (res.outcome.ok) toast.success(`Delivered (HTTP ${res.outcome.status})`);
      else toast.error(`Failed: ${res.outcome.status ? `HTTP ${res.outcome.status}` : res.outcome.excerpt}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="xs" variant="outline" disabled={busy || disabled} onClick={() => void handleClick()}>
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCw className="size-3.5" aria-hidden />}
      Redeliver
    </Button>
  );
}
