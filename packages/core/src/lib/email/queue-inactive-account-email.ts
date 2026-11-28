import { createTranslator } from "next-intl";

import { brand } from "@ostiary/core/lib/brand";
import type { InactiveAction } from "@ostiary/core/lib/auth-policy-options";
import type { EmailContent } from "@ostiary/core/lib/email/layout";
import { queueEmail } from "@ostiary/core/lib/email/send";
import { getHtmlLang } from "@ostiary/core/i18n/locale-html";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import type en from "../../../messages/en.json";

type Messages = typeof en;

export type InactiveAccountEmailInput = {
    email: string;
    action: InactiveAction;
    /** When the account is disabled or deleted, at the earliest. */
    on: Date;
    /** The sign-in page: signing in keeps the account. */
    url: string;
};

/** Subject and content of the warning before an inactive account is disabled or deleted. */
export function inactiveAccountEmail(
    locale: AppLocale,
    messages: Messages,
    input: InactiveAccountEmailInput,
): { subject: string; content: EmailContent } {
    const t = createTranslator({ locale, messages, namespace: "emails.inactiveAccount" });
    const lang = getHtmlLang(locale);
    const date = new Intl.DateTimeFormat(lang, { dateStyle: "long", timeZone: "UTC" }).format(input.on);
    const values = { brand: brand.name, email: input.email, date };
    const subject = t(`subjects.${input.action}`, values);
    const body = t(`bodies.${input.action}`, values);
    return {
        subject,
        content: {
            preheader: body,
            heading: subject,
            body: [body, t("keep", values)],
            button: { label: t("button", values), url: input.url },
            footnote: t("footnote", values),
            lang,
        },
    };
}

export function queueInactiveAccountEmail(input: InactiveAccountEmailInput & { locale: AppLocale }): void {
    queueEmail("inactive-account", input.email, async () => {
        const messages = (await import(`../../../messages/${input.locale}.json`)).default as Messages;
        return inactiveAccountEmail(input.locale, messages, input);
    });
}
