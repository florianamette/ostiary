"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";

/** Loads the overview's numbers again, on the server. */
export function OverviewRefreshButton() {
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? null : <RefreshCwIcon />}
      {tc("refresh")}
    </Button>
  );
}
