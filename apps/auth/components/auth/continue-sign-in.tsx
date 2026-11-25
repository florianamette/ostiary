"use client";

import * as React from "react";

import { Button } from "@ostiary/core/components/ui/button";

import { authClient } from "@/lib/auth-client";

/**
 * Resumes the app's sign-in from the two-factor prompt (the OAuth provider's post-login page):
 * /oauth2/continue with the signed request the page was given. The client plugins follow the
 * redirect to the consent page or the app. `auto`: at once, when there is nothing to ask.
 */
export function ContinueSignIn({ label, auto = false, variant = "outline" }: { label: string; auto?: boolean; variant?: "outline" | "default" }) {
  const [busy, setBusy] = React.useState(auto);
  const resume = React.useCallback(async () => {
    setBusy(true);
    const { error } = await authClient.$fetch("/oauth2/continue", { method: "POST", body: { postLogin: true } });
    if (error) setBusy(false);
  }, []);
  React.useEffect(() => {
    if (auto) void resume();
  }, [auto, resume]);
  return (
    <Button type="button" variant={variant} loading={busy} onClick={() => void resume()}>
      {label}
    </Button>
  );
}
