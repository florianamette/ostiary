import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { locales } from "@ostiary/core/i18n/routing";
import { brand } from "@ostiary/core/lib/brand";
import { renderEmail } from "@ostiary/core/lib/email/layout";
import { signInCodeEmail } from "@ostiary/core/lib/email/queue-sign-in-code-email";

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../../../messages/${locale}.json`), "utf8"));

describe("sign-in code email", () => {
  it.each(locales)("is complete in %s", (locale) => {
    const { subject, content } = signInCodeEmail(locale, messages(locale), "042917");
    for (const text of [subject, content.preheader, content.heading, ...content.body, content.note ?? "", content.footnote]) {
      expect(text.trim()).not.toBe("");
      // Placeholders are filled in (none left as `{brand}` or `{minutes}`).
      expect(text).not.toMatch(/[{}]/);
    }
    expect(subject).toContain(brand.name);
    expect(content.note).toContain("10");
    expect(content.code).toBe("042917");
  });

  it("shows the code instead of a button, in the email's language", () => {
    const { content } = signInCodeEmail("ar", messages("ar"), "123456");
    const { html, text } = renderEmail(content);
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain(">123456</p>");
    expect(html).not.toContain("Button not working?");
    expect(text).toContain("123456");
  });

  it("keeps link emails as they were", () => {
    const { html, text } = renderEmail({
      preheader: "p",
      heading: "h",
      body: ["b"],
      button: { label: "Go", url: "https://example.com/x?a=1&b=2" },
      footnote: "f",
    });
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain("Button not working?");
    expect(html).toContain("https://example.com/x?a=1&amp;b=2");
    expect(text).toContain("Go: https://example.com/x?a=1&b=2");
  });
});

describe("messages", () => {
  // Every string added for sign-in codes and captcha exists in every locale.
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];
  const en = messages("en");
  const required = [
    ...keys(en.auth.emailCode, "auth.emailCode"),
    ...keys(en.captcha, "captcha"),
    ...keys(en.emails, "emails"),
    "auth.login.emailCode",
    "auth.login.lastUsedHintEmailCode",
  ];

  it.each(locales)("%s has the sign-in code and captcha strings", (locale) => {
    const present = new Set(keys(messages(locale)));
    expect(required.filter((key) => !present.has(key))).toEqual([]);
  });
});
