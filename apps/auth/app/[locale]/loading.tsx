import { getLocale, getTranslations } from "next-intl/server";

import { Skeleton } from "@ostiary/core/components/ui/skeleton";

export default async function LocaleLoading() {
  await getLocale();
  const t = await getTranslations("common");

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-4 p-8">
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
      <Skeleton className="h-40 w-full max-w-md rounded-xl" />
    </div>
  );
}
