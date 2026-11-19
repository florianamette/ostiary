"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Separator } from "@ostiary/core/components/ui/separator";
import { UsernameStatusHint } from "@/components/auth/username-status-hint";
import { DashboardEmailField } from "@/components/dashboard/dashboard-email-field";
import { useDashboardSession } from "@/components/dashboard/dashboard-session";
import { authClient } from "@/lib/auth-client";
import { useAuthErrorMessage } from "@/lib/auth-error-message";
import {
  checkUsernameAvailabilitySoon,
  hasUsernameCharacters,
  USERNAME_MIN_LENGTH,
  usernameProblem,
  type UsernameStatus,
} from "@/lib/username";

export function DashboardProfileSection() {
  const t = useTranslations("dashboard.profile");
  const errorMessage = useAuthErrorMessage();
  const { data: current } = useDashboardSession();
  const user = current.user;
  const [name, setName] = React.useState(user.name);
  const [username, setUsername] = React.useState("");
  const [usernameStatus, setUsernameStatus] = React.useState<
    UsernameStatus | "unchanged"
  >("unchanged");
  const [saving, setSaving] = React.useState(false);

  const currentUsername = user.displayUsername || user.username || "";

  React.useEffect(() => {
    if (user.name) setName(user.name);
  }, [user.name]);

  React.useEffect(() => {
    setUsername(currentUsername);
    setUsernameStatus("unchanged");
  }, [currentUsername]);

  React.useEffect(() => {
    const trimmed = username.trim();
    if (trimmed === currentUsername.trim()) {
      setUsernameStatus("unchanged");
      return;
    }
    if (trimmed.length < USERNAME_MIN_LENGTH) {
      setUsernameStatus(trimmed.length === 0 ? "unchanged" : "invalid");
      return;
    }
    if (!hasUsernameCharacters(trimmed)) {
      setUsernameStatus("invalid");
      return;
    }
    return checkUsernameAvailabilitySoon(trimmed, setUsernameStatus);
  }, [username, currentUsername]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const namePayload = name.trim() || user.name;
    const usernameChanged = trimmedUsername !== currentUsername.trim();

    // Busy before the username check: it can wait on the network.
    setSaving(true);
    try {
      if (usernameChanged) {
        const problem = await usernameProblem(trimmedUsername, usernameStatus);
        if (problem) {
          toast.error(t(problem));
          return;
        }
      }
      const { error } = await authClient.updateUser({
        name: namePayload,
        ...(usernameChanged ? { username: trimmedUsername } : {}),
      });
      if (error) {
        toast.error(
          errorMessage(error, t("saveError"), { USERNAME_IS_ALREADY_TAKEN: t("usernameTaken") }),
        );
        return;
      }
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  // An empty display name falls back to the saved one, so it is not a change.
  const trimmedName = name.trim();
  const isDirty =
    (trimmedName !== "" && trimmedName !== user.name) ||
    username.trim() !== currentUsername.trim();

  return (
    <Card id="profile" className="scroll-mt-32 border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSaveProfile}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dashboard-name">{t("nameLabel")}</FieldLabel>
              <Input
                id="dashboard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoComplete="name"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dashboard-username">
                {t("usernameLabel")}
              </FieldLabel>
              <Input
                id="dashboard-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={saving}
                autoComplete="username"
              />
              <FieldDescription>{t("usernameHint")}</FieldDescription>
              {username.trim().length >= USERNAME_MIN_LENGTH &&
              username.trim() !== currentUsername.trim() ? (
                <UsernameStatusHint
                  status={usernameStatus}
                  messages={{
                    checking: t("usernameChecking"),
                    available: t("usernameAvailable"),
                    taken: t("usernameTaken"),
                    invalid: t("usernameInvalidHint"),
                  }}
                />
              ) : null}
            </Field>
            <Field>
              <Button type="submit" loading={saving} disabled={!isDirty}>
                {saving ? t("saving") : t("save")}
              </Button>
            </Field>
          </FieldGroup>
        </form>
        <Separator />
        <DashboardEmailField
          email={user.email}
          emailVerified={Boolean(user.emailVerified)}
        />
      </CardContent>
    </Card>
  );
}
