"use client";

import { useLocale } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const locale = useLocale();

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => {
        void authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              window.location.href = `/${locale}/login`;
            },
          },
        });
      }}
    >
      Sign out
    </Button>
  );
}
