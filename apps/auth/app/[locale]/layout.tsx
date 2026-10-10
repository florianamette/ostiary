import type { Metadata, Viewport } from "next";

import { LocaleLayout, localeMetadata } from "@ostiary/core/components/layout/locale-layout";
import { routing } from "@ostiary/core/i18n/routing";
import { brand, themeColor } from "@ostiary/core/lib/brand";

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

  return {
    ...(await localeMetadata(locale)),
    applicationName: brand.name,
    openGraph: {
      type: "website",
      siteName: brand.name,
      title: brand.name,
      description: brand.tagline,
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title: brand.name,
      description: brand.tagline,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: themeColor.dark },
  ],
};

export default LocaleLayout;
