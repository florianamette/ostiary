import { describe, expect, it } from "vitest";

import { newDeviceEmail } from "@ostiary/core/lib/email/queue-new-device-email";
import { locales, type AppLocale } from "@ostiary/core/i18n/routing";

const input = {
  email: "person@example.test",
  url: "https://auth.example.test/en/secure-account?token=abc",
  at: new Date("2026-11-27T14:05:00Z"),
  device: { browser: "Firefox", system: "Linux" },
  ipAddress: "203.0.113.9",
};

describe("newDeviceEmail", () => {
  it("names the time, device and address, with the button", async () => {
    const messages = (await import("../../../messages/en.json")).default;
    const { subject, content } = newDeviceEmail("en", messages, input);
    expect(subject).toContain("New sign-in");
    expect(content.body.join("\n")).toContain("November 27, 2026");
    expect(content.body.join("\n")).toContain("UTC");
    expect(content.body).toContain("Device: Firefox on Linux");
    expect(content.body).toContain("IP address: 203.0.113.9");
    expect(content.button).toEqual({ label: "This wasn't me", url: input.url });
  });

  it("names the country when it is known", async () => {
    const messages = (await import("../../../messages/en.json")).default;
    expect(newDeviceEmail("en", messages, { ...input, country: "FR" }).content.body).toContain("Location: France");
    const fr = (await import("../../../messages/fr.json")).default;
    expect(newDeviceEmail("fr", fr, { ...input, country: "DE" }).content.body).toContain("Lieu : Allemagne");
  });

  it("builds in every locale, also without a known device or address", async () => {
    for (const locale of locales as readonly AppLocale[]) {
      const messages = (await import(`../../../messages/${locale}.json`)).default;
      const { content } = newDeviceEmail(locale, messages, { ...input, device: { browser: null, system: null }, ipAddress: null });
      expect(content.button?.label, locale).toBeTruthy();
      expect(content.body.join(" "), locale).not.toMatch(/\{|emails\.newDevice/);
    }
  });
});
