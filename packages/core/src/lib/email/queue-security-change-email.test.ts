import { describe, expect, it } from "vitest";

import { SECURITY_CHANGES, securityChangeEmail } from "@ostiary/core/lib/email/queue-security-change-email";
import { locales, type AppLocale } from "@ostiary/core/i18n/routing";

const input = {
  change: "two_factor_disabled" as const,
  email: "person@example.test",
  url: "https://auth.example.test/en/secure-account?token=abc",
  at: new Date("2026-11-27T14:05:00Z"),
  device: { browser: "Firefox", system: "Linux" },
  ipAddress: "203.0.113.9",
};

describe("securityChangeEmail", () => {
  it("says what changed, when, from where, with the button", async () => {
    const messages = (await import("../../../messages/en.json")).default;
    const { subject, content } = securityChangeEmail("en", messages, input);
    expect(subject).toBe("Two-factor authentication was turned off");
    expect(content.body[0]).toContain("person@example.test");
    expect(content.body.join("\n")).toContain("November 27, 2026");
    expect(content.body).toContain("Device: Firefox on Linux");
    expect(content.body).toContain("IP address: 203.0.113.9");
    expect(content.button).toEqual({ label: "This wasn't me", url: input.url });
  });

  it("builds every change in every locale", async () => {
    for (const locale of locales as readonly AppLocale[]) {
      const messages = (await import(`../../../messages/${locale}.json`)).default;
      for (const change of SECURITY_CHANGES) {
        const { subject, content } = securityChangeEmail(locale, messages, { ...input, change, device: { browser: null, system: null }, ipAddress: null });
        expect(subject, `${locale} ${change}`).toBeTruthy();
        expect([subject, ...content.body, content.note, content.footnote].join(" "), `${locale} ${change}`).not.toMatch(/\{|emails\.securityChange/);
      }
    }
  });
});
