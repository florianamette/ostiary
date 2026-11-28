/**
 * Sent by the sign-in form with a sign-in code request: where the email's sign-in link resumes
 * (an app's sign-in), see sign-in-link.ts. No database here: the form imports it.
 */
export const SIGN_IN_LINK_CALLBACK_HEADER = "x-ostiary-callback-url";
