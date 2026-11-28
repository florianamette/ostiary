import { createTranslator } from "next-intl";

import { brand } from "@ostiary/core/lib/brand";
import type { EmailContent } from "@ostiary/core/lib/email/layout";
import { SECURE_ACCOUNT_LINK_DAYS } from "@ostiary/core/lib/email/queue-new-device-email";
import { queueEmail } from "@ostiary/core/lib/email/send";
import { getHtmlLang } from "@ostiary/core/i18n/locale-html";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import type { DeviceName } from "@ostiary/core/lib/security/user-agent";
import type en from "../../../messages/en.json";

type Messages = typeof en;

/** The changes to an account's sign-in methods that are emailed (security/security-change.ts). */
export const SECURITY_CHANGES = [
    "password_changed",
    "password_reset",
    "two_factor_enabled",
    "two_factor_disabled",
    "passkey_added",
    "passkey_removed",
] as const;

export type SecurityChange = (typeof SECURITY_CHANGES)[number];

export type SecurityChangeEmailInput = {
    change: SecurityChange;
    email: string;
    /** The "This wasn't me" link. */
    url: string;
    at: Date;
    device: DeviceName;
    ipAddress: string | null;
};

/** Subject and content of the email about a change to the account's sign-in methods. */
export function securityChangeEmail(
    locale: AppLocale,
    messages: Messages,
    input: SecurityChangeEmailInput,
): { subject: string; content: EmailContent } {
    const t = createTranslator({ locale, messages, namespace: "emails.securityChange" });
    const lang = getHtmlLang(locale);
    // dateStyle and timeZoneName cannot be combined: the zone is written after the time.
    const when = `${new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(input.at)} UTC`;
    const { browser, system } = input.device;
    const device = browser && system ? t("deviceOn", { browser, system }) : browser || system || t("unknownDevice");
    const values = { brand: brand.name, email: input.email, days: SECURE_ACCOUNT_LINK_DAYS };
    const body = t(`bodies.${input.change}`, values);
    return {
        subject: t(`subjects.${input.change}`, values),
        content: {
            preheader: body,
            heading: t(`subjects.${input.change}`, values),
            body: [
                body,
                t("when", { when }),
                t("device", { device }),
                t("ipAddress", { ip: input.ipAddress ?? t("unknownIp") }),
                t("ifYou", values),
            ],
            button: { label: t("button", values), url: input.url },
            note: t("note", values),
            footnote: t("footnote", values),
            lang,
        },
    };
}

/** Tells the person a sign-in method of their account changed. */
export function queueSecurityChangeEmail(input: SecurityChangeEmailInput & { locale: AppLocale }): void {
    queueEmail("security-change", input.email, async () => {
        const messages = (await import(`../../../messages/${input.locale}.json`)).default as Messages;
        return securityChangeEmail(input.locale, messages, input);
    });
}
