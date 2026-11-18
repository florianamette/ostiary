"use client";

import { useCallback } from "react";

import { usePathname, useRouter } from "@ostiary/core/i18n/navigation";
import type { AppLocale } from "@ostiary/core/i18n/routing";

/**
 * Switches the page to another locale and keeps its query string and fragment: the
 * callbackURL and signed OAuth request on /login, the token on /reset-password, the
 * user_code on /device. The query is read when the person picks a language, so the
 * component needs no useSearchParams (and no Suspense boundary).
 */
export function useSwitchLocale(): (locale: AppLocale) => void {
  const pathname = usePathname();
  const router = useRouter();
  return useCallback(
    (locale: AppLocale) => {
      const { search, hash } = window.location;
      router.replace(`${pathname}${search}${hash}`, { locale });
    },
    [pathname, router],
  );
}
