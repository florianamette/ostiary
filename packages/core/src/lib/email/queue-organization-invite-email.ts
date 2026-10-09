import { brand } from "@ostiary/core/lib/brand";
import type { EmailContent } from "@ostiary/core/lib/email/layout";
import { queueEmail } from "@ostiary/core/lib/email/send";
import { userText } from "@ostiary/core/lib/email/user-text";

type InviteInput = {
  to: string;
  inviteUrl: string;
  organizationName: string;
  inviterName: string;
};

/**
 * Subject and content of an organization invitation. The inviter's and the organization's
 * names are chosen by users, so they are cleaned (no line breaks, links or invisible
 * characters, 60 characters at most) and quoted: they can only read as a name.
 */
export function organizationInviteEmail(input: InviteInput): { subject: string; content: EmailContent } {
  const inviter = userText(input.inviterName, "A member");
  const organization = `"${userText(input.organizationName, "an organization")}"`;
  return {
    subject: `${inviter} invited you to ${organization} on ${brand.name}`,
    content: {
      preheader: `Join ${organization} on ${brand.name}.`,
      heading: `Join ${organization}`,
      body: [`${inviter} invited you to join the organization ${organization} on ${brand.name}.`],
      button: { label: "Accept invitation", url: input.inviteUrl },
      note: "You'll be asked to sign in or create an account first.",
      footnote: `Not expecting this invitation? You can ignore this email. The names above were chosen by the person who invited you, not by ${brand.name}.`,
    },
  };
}

/** Organization invitation link (Better Auth organization plugin). */
export function queueOrganizationInviteEmail(input: InviteInput): void {
  const { subject, content } = organizationInviteEmail(input);
  queueEmail("organization invite", input.to, subject, content);
}
