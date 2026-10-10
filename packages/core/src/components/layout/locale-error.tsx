"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";

export function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-4 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">{t("boundaryTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("boundaryDescription")}
        </p>
        <Button className="mt-6" type="button" onClick={() => reset()}>
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}
