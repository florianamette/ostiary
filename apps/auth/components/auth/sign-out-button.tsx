"use client";

import { useLocale, useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const locale = useLocale();
  const t = useTranslations("dashboard.nav");

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => {
        void authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: the session is gone
              window.location.href = `/${locale}/login`;
            },
          },
        });
      }}
    >
      {t("signOut")}
    </Button>
  );
}
