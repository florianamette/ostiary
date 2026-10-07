import { brand } from "@ostiary/core/lib/brand";
import { queueEmail } from "@ostiary/core/lib/email/send";

/** Password reset link (Better Auth `sendResetPassword`). */
export function queuePasswordResetEmail(input: { to: string; url: string }): void {
  queueEmail("password reset", input.to, "Reset your password", {
    preheader: `Choose a new password for your ${brand.name} account.`,
    heading: "Reset your password",
    body: [
      `Someone asked to reset the password of the ${brand.name} account linked to this address. If it was you, choose a new password below.`,
      "Once it's changed, you'll be signed out of your other sessions.",
    ],
    button: { label: "Choose a new password", url: input.url },
    note: "This link expires in 1 hour and can only be used once.",
    footnote: "Didn't ask for this? Ignore this email: your password stays the same.",
  });
}
