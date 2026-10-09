import { createTranslator } from "next-intl";

import { brand } from "@ostiary/core/lib/brand";
import type { EmailContent } from "@ostiary/core/lib/email/layout";
import { queueEmail } from "@ostiary/core/lib/email/send";
import { getHtmlLang } from "@ostiary/core/i18n/locale-html";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import { ACCOUNT_DELETION_LINK_MINUTES } from "@ostiary/core/lib/account-data/limits";
import type en from "../../../messages/en.json";

type Messages = typeof en;

/** Subject and content of the account deletion email, in the given locale's messages. */
export function accountDeletionEmail(
  locale: AppLocale,
  messages: Messages,
  input: { url: string; email: string },
): { subject: string; content: EmailContent } {
  const t = createTranslator({ locale, messages, namespace: "emails.deleteAccount" });
  const values = { brand: brand.name, email: input.email, minutes: ACCOUNT_DELETION_LINK_MINUTES };
  return {
    subject: t("subject", values),
    content: {
      preheader: t("preheader", values),
      heading: t("heading", values),
      body: [t("body", values), t("consequences", values)],
      button: { label: t("button", values), url: input.url },
      note: t("note", values),
      footnote: t("footnote", values),
      lang: getHtmlLang(locale),
    },
  };
}

/**
 * The last step before an account is deleted (Better Auth `sendDeleteAccountVerification`):
 * a link to a page where the signed-in person confirms once more. Opening the link alone
 * deletes nothing, so a mail scanner that follows links cannot delete an account.
 */
export async function queueAccountDeletionEmail(input: { to: string; url: string; locale: AppLocale }): Promise<void> {
  const messages = (await import(`../../../messages/${input.locale}.json`)).default as Messages;
  const { subject, content } = accountDeletionEmail(input.locale, messages, { url: input.url, email: input.to });
  queueEmail("delete-account", input.to, subject, content);
}
