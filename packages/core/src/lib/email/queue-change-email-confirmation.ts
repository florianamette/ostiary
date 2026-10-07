import { brand } from "@ostiary/core/lib/brand";
import { queueEmail } from "@ostiary/core/lib/email/send";

/**
 * Sent to the current address when someone asks to move the account to a new one
 * (Better Auth `sendChangeEmailConfirmation`). Approving it sends a verification link
 * to the new address; nothing changes until both steps are done.
 */
export function queueChangeEmailConfirmation(input: {
  to: string;
  newEmail: string;
  url: string;
}): void {
  queueEmail("change-email-confirmation", input.to, "Confirm your new email address", {
    preheader: `Someone asked to change the email address on your ${brand.name} account.`,
    heading: "Confirm your new email address",
    body: [
      `A request was made to change the email address on your ${brand.name} account to ${input.newEmail}.`,
      "If this was you, approve the change below. We will then send a verification link to the new address.",
    ],
    button: { label: "Approve email change", url: input.url },
    note: "This link expires in 1 hour.",
    footnote:
      "If you didn't ask for this, ignore this email: your address stays the same. Consider changing your password, since the request came from a signed-in session.",
  });
}
