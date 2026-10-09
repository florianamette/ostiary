import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { locales } from "@ostiary/core/i18n/routing";
import { brand } from "@ostiary/core/lib/brand";
import { renderEmail } from "@ostiary/core/lib/email/layout";
import { accountDeletionEmail } from "@ostiary/core/lib/email/queue-account-deletion-email";

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../../../messages/${locale}.json`), "utf8"));

const url = "https://auth.example.com/en/delete-account?token=abc123";

describe("account deletion email", () => {
  it.each(locales)("is complete in %s", (locale) => {
    const { subject, content } = accountDeletionEmail(locale, messages(locale), { url, email: "ada@example.com" });
    for (const text of [subject, content.preheader, content.heading, ...content.body, content.note ?? "", content.footnote, content.button?.label ?? ""]) {
      expect(text.trim()).not.toBe("");
      expect(text).not.toMatch(/[{}]/);
    }
    expect(subject).toContain(brand.name);
    expect(content.body.join(" ")).toContain("ada@example.com");
    expect(content.note).toContain("60");
    expect(content.button?.url).toBe(url);
  });

  it("links to the confirmation page, never deleting on open", () => {
    const { content } = accountDeletionEmail("en", messages("en"), { url, email: "ada@example.com" });
    const { html, text } = renderEmail(content);
    expect(html).toContain("delete-account?token=abc123");
    expect(html).not.toContain("/delete-user/callback");
    expect(text).toContain(url);
  });
});
