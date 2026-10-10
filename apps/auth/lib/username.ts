import { authClient } from "@/lib/auth-client";

/*
 * Username checks shared by the sign-up form and the dashboard profile: the format hints shown
 * while typing and the checks before submitting. The server enforces the same rules.
 */

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export const USERNAME_MIN_LENGTH = 3;

export function hasUsernameCharacters(username: string): boolean {
  return /^[a-zA-Z0-9_.]+$/.test(username);
}

/**
 * Asks the server whether a (trimmed, well-formed) username is free once typing pauses.
 * Returns the cleanup for an effect.
 */
export function checkUsernameAvailabilitySoon(
  username: string,
  setStatus: (status: UsernameStatus) => void,
): () => void {
  setStatus("checking");
  const timer = window.setTimeout(() => {
    void (async () => {
      const { data, error } = await authClient.isUsernameAvailable({ username });
      if (error) {
        setStatus("idle");
        return;
      }
      setStatus(data?.available ? "available" : "taken");
    })();
  }, 400);
  return () => window.clearTimeout(timer);
}

/**
 * Why a trimmed username cannot be submitted (a translation key), or null. Asks the server
 * again unless the last check already found it available.
 */
export async function usernameProblem(
  username: string,
  status: UsernameStatus | "unchanged",
): Promise<"usernameTooShort" | "usernameInvalid" | "usernameTaken" | null> {
  if (username.length < USERNAME_MIN_LENGTH) return "usernameTooShort";
  if (!hasUsernameCharacters(username)) return "usernameInvalid";
  if (status !== "available") {
    const { data } = await authClient.isUsernameAvailable({ username });
    if (!data?.available) return "usernameTaken";
  }
  return null;
}
