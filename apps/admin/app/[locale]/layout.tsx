import type { Metadata } from "next";

import { LocaleLayout, localeMetadata } from "@ostiary/core/components/layout/locale-layout";
import { routing } from "@ostiary/core/i18n/routing";

import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return localeMetadata(locale);
}

export default LocaleLayout;
