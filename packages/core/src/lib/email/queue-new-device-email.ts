import { createTranslator } from "next-intl";

import { brand } from "@ostiary/core/lib/brand";
import type { EmailContent } from "@ostiary/core/lib/email/layout";
import { queueEmail } from "@ostiary/core/lib/email/send";
import { getHtmlLang } from "@ostiary/core/i18n/locale-html";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import type { DeviceName } from "@ostiary/core/lib/security/user-agent";
import { countryName } from "@ostiary/core/lib/country-policy-options";
import type en from "../../../messages/en.json";

type Messages = typeof en;

/** Days the "This wasn't me" link works. */
export const SECURE_ACCOUNT_LINK_DAYS = 7;

export type NewDeviceEmailInput = {
    email: string;
    url: string;
    at: Date;
    device: DeviceName;
    ipAddress: string | null;
    /** ISO 3166-1 alpha-2, when known (country.ts). */
    country?: string | null;
};

/** Subject and content of the new-device sign-in email, in the given locale's messages. */
export function newDeviceEmail(locale: AppLocale, messages: Messages, input: NewDeviceEmailInput): { subject: string; content: EmailContent } {
    const t = createTranslator({ locale, messages, namespace: "emails.newDevice" });
    const lang = getHtmlLang(locale);
    // dateStyle and timeZoneName cannot be combined: the zone is written after the time.
    const when = `${new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(input.at)} UTC`;
    const { browser, system } = input.device;
    const device =
        browser && system ? t("deviceOn", { browser, system }) : browser || system || t("unknownDevice");
    const values = { brand: brand.name, email: input.email, days: SECURE_ACCOUNT_LINK_DAYS };
    return {
        subject: t("subject", values),
        content: {
            preheader: t("preheader", values),
            heading: t("heading", values),
            body: [
                t("body", values),
                t("when", { when }),
                t("device", { device }),
                t("ipAddress", { ip: input.ipAddress ?? t("unknownIp") }),
                ...(input.country ? [t("location", { country: countryName(lang, input.country) })] : []),
                t("ifYou", values),
            ],
            button: { label: t("button", values), url: input.url },
            note: t("note", values),
            footnote: t("footnote", values),
            lang,
        },
    };
}

/** Tells the person their account was signed in to from a browser it had not used before. */
export function queueNewDeviceEmail(input: NewDeviceEmailInput & { locale: AppLocale }): void {
    queueEmail("new-device", input.email, async () => {
        const messages = (await import(`../../../messages/${input.locale}.json`)).default as Messages;
        return newDeviceEmail(input.locale, messages, input);
    });
}
