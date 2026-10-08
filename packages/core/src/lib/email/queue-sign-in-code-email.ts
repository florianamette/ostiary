import { createTranslator } from "next-intl";

import { brand } from "@ostiary/core/lib/brand";
import type { EmailContent } from "@ostiary/core/lib/email/layout";
import { queueEmail } from "@ostiary/core/lib/email/send";
import { SIGN_IN_CODE_MINUTES } from "@ostiary/core/lib/sign-in-code";
import { getHtmlLang } from "@ostiary/core/i18n/locale-html";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import type en from "../../../messages/en.json";

/** Every locale's messages have the shape of the English ones. */
type Messages = typeof en;

/** Subject and content of the sign-in code email, in the given locale's messages. */
export function signInCodeEmail(locale: AppLocale, messages: Messages, code: string): { subject: string; content: EmailContent } {
  const t = createTranslator({ locale, messages, namespace: "emails.signInCode" });
  const values = { brand: brand.name, minutes: SIGN_IN_CODE_MINUTES };
  return {
    subject: t("subject", values),
    content: {
      preheader: t("preheader", values),
      heading: t("heading", values),
      body: [t("body", values)],
      code,
      note: t("note", values),
      footnote: t("footnote", values),
      lang: getHtmlLang(locale),
    },
  };
}

/**
 * Sign-in code (Better Auth `emailOTP`, type `sign-in`), written in the language of the page
 * the code was asked from. Not awaited by the caller: an unknown address sends nothing, so
 * waiting for this would make known addresses slower to answer.
 */
export async function queueSignInCodeEmail(input: { to: string; code: string; locale: AppLocale }): Promise<void> {
  const messages = (await import(`../../../messages/${input.locale}.json`)).default as Messages;
  const { subject, content } = signInCodeEmail(input.locale, messages, input.code);
  queueEmail("sign-in", input.to, subject, content);
}
