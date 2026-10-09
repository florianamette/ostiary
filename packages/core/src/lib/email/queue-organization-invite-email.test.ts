import { describe, expect, it } from "vitest";

import { brand } from "@ostiary/core/lib/brand";
import { renderEmail } from "@ostiary/core/lib/email/layout";
import { organizationInviteEmail } from "@ostiary/core/lib/email/queue-organization-invite-email";
import { userText } from "@ostiary/core/lib/email/user-text";

const inviteUrl = "https://auth.example.com/en/accept-invitation/inv_123";
const invite = (inviterName: string, organizationName: string) =>
  organizationInviteEmail({ to: "ada@example.com", inviteUrl, inviterName, organizationName });

describe("userText", () => {
  it.each([
    ["Ada Lovelace", "Ada Lovelace"],
    ["  Ada \n\t Lovelace  ", "Ada Lovelace"],
    ["Acme Inc.", "Acme Inc."],
    ["Ada\r\nBcc: victim@example.com", "Ada Bcc: victim(at)example[.]com"],
    ["Visit https://evil.example/login now", "Visit https evil[.]example/login now"],
    ["www.evil.example", "www[.]evil[.]example"],
    ["IT‮ecivreS", "IT ecivreS"],
    ["Pay​Pal", "Pay Pal"],
    ["ｅｖｉｌ．ｃｏｍ", "evil[.]com"],
  ])("cleans %j", (raw, expected) => {
    expect(userText(raw, "fallback")).toBe(expected);
  });

  it("falls back on empty values and cuts long ones", () => {
    expect(userText("", "Someone")).toBe("Someone");
    expect(userText(null, "Someone")).toBe("Someone");
    expect(userText("​‮ \n", "Someone")).toBe("Someone");
    const long = userText("A".repeat(500), "x", 60);
    expect(long).toHaveLength(60);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("organization invitation email", () => {
  it("names the inviter and the organization", () => {
    const { subject, content } = invite("Ada Lovelace", "Analytical Engines");
    expect(subject).toBe(`Ada Lovelace invited you to "Analytical Engines" on ${brand.name}`);
    expect(content.body.join(" ")).toContain('Ada Lovelace invited you to join the organization "Analytical Engines"');
    expect(content.button?.url).toBe(inviteUrl);
  });

  it("keeps attacker-chosen names from rewriting the email", () => {
    const { subject, content } = invite(
      "Security Team\r\nBcc: everyone@example.com",
      '<a href="https://evil.example">Verify your account</a> at https://evil.example/login',
    );
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThan(200);
    const { html, text } = renderEmail(content);
    // No markup from the names, and no link anywhere but the invitation's.
    expect(html).not.toContain("<a href=\"https://evil");
    expect(html).not.toContain("https://evil");
    expect(text).not.toContain("https://evil");
    expect(text).not.toContain("evil.example");
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(links).toContain(inviteUrl);
    expect(links.some((href) => href.includes("evil"))).toBe(false);
    expect(text).toContain(inviteUrl);
  });

  it("uses neutral wording when names are empty", () => {
    const { subject } = invite("", "");
    expect(subject).toBe(`A member invited you to "an organization" on ${brand.name}`);
  });
});
