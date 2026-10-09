import type { Metadata, Viewport } from "next";
import { brand } from "@ostiary/core/lib/brand";

import { themeColor } from "@ostiary/core/lib/brand";
import { Geist_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Providers } from "@/app/providers";
import { APP_TIME_ZONE } from "@ostiary/core/i18n/constants";
import { getHtmlLang, isRtlLocale } from "@ostiary/core/i18n/locale-html";
import { locales, routing, type AppLocale } from "@ostiary/core/i18n/routing";
import { VercelAnalytics } from "@ostiary/core/components/vercel-analytics";
import { NONCE_HEADER } from "@ostiary/core/lib/csp";
import { env } from "@ostiary/core/lib/env";
import { getBaseURL } from "@ostiary/core/lib/url";
import { cn } from "@ostiary/core/lib/utils";

import "../globals.css";


const instrumentSans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "layout" });
  const base = getBaseURL();
  const languages = Object.fromEntries(
    locales.map((l) => [l, `${base}/${l}`]),
  ) as Record<string, string>;

  return {
    metadataBase: new URL(`${base.endsWith("/") ? base.slice(0, -1) : base}/`),
    title: {
      default: t("title"),
      template: `%s | ${brand.name}`,
    },
    description: t("description"),
    alternates: {
      languages,
    },
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

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // The CSP nonce set by proxy.ts. Reading it also renders every page per request, which a
  // nonce needs (a prerendered page would carry none).
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  const messages = await getMessages();
  const appLocale = locale as AppLocale;
  const htmlLang = getHtmlLang(appLocale);
  const dir = isRtlLocale(appLocale) ? "rtl" : "ltr";

  return (
    <html
      lang={htmlLang}
      dir={dir}
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        instrumentSans.variable,
        instrumentSerif.variable,
        geistMono.variable,
        "font-sans",
      )}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone={APP_TIME_ZONE}
        >
          <Providers nonce={nonce}>{children}</Providers>
        </NextIntlClientProvider>
        {env.VERCEL_ANALYTICS === "true" ? <VercelAnalytics /> : null}
      </body>
    </html>
  );
}
