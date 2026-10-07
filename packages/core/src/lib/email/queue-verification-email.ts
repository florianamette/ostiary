import { brand } from "@ostiary/core/lib/brand";
import { queueEmail } from "@ostiary/core/lib/email/send";

/** Email verification link (Better Auth `sendVerificationEmail`). */
export function queueVerificationEmail(input: { to: string; url: string }): void {
  queueEmail("verification", input.to, "Verify your email address", {
    preheader: `Confirm your email to finish setting up your ${brand.name} account.`,
    heading: "Verify your email address",
    body: [
      `Confirm that this is your email address to finish setting up your ${brand.name} account: the one account you use to sign in to every connected app.`,
    ],
    button: { label: "Verify email address", url: input.url },
    note: "This link expires in 1 hour. You can ask for a new one from the sign-in page.",
    footnote: "If you didn't create an account, you can ignore this email: nothing happens until the address is verified.",
  });
}
