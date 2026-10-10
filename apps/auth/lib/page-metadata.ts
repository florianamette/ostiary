import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * `generateMetadata` for a page kept out of search results: the title is `titleKey` in the
 * `namespace` messages, and `follow` says whether crawlers may follow its links.
 */
export function noIndexMetadata(namespace: string, titleKey: string, { follow }: { follow: boolean }) {
  return async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace });
    return { title: t(titleKey), robots: { index: false, follow } };
  };
}
