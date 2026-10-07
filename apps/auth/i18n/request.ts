import { hasLocale } from "next-intl";

import { APP_TIME_ZONE } from "@ostiary/core/i18n/constants";
import { getRequestConfig } from "next-intl/server";

import { routing } from "@ostiary/core/i18n/routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    timeZone: APP_TIME_ZONE,
    messages: (await import(`../../../packages/core/messages/${locale}.json`)).default,
  };
});
