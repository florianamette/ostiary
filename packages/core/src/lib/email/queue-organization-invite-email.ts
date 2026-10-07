import { brand } from "@ostiary/core/lib/brand";
import { queueEmail } from "@ostiary/core/lib/email/send";

/** Organization invitation link (Better Auth organization plugin). */
export function queueOrganizationInviteEmail(input: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  inviterName: string;
}): void {
  queueEmail("organization invite", input.to, `${input.inviterName} invited you to ${input.organizationName}`, {
    preheader: `Join ${input.organizationName} on ${brand.name}.`,
    heading: `Join ${input.organizationName}`,
    body: [`${input.inviterName} invited you to join ${input.organizationName} on ${brand.name}.`],
    button: { label: "Accept invitation", url: input.inviteUrl },
    note: "You'll be asked to sign in or create an account first.",
    footnote: "Not expecting this invitation? You can ignore this email.",
  });
}
