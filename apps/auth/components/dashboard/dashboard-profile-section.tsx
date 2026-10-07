"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
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
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { DashboardEmailField } from "@/components/dashboard/dashboard-email-field";
import { authClient } from "@/lib/auth-client";

export function DashboardProfileSection() {
  const t = useTranslations("dashboard.profile");
  const { data: sessionData, isPending: sessionPending } =
    authClient.useSession();

  const user = sessionData?.user;
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [usernameStatus, setUsernameStatus] = React.useState<
    "idle" | "checking" | "available" | "taken" | "invalid" | "unchanged"
  >("unchanged");
  const [saving, setSaving] = React.useState(false);

  const currentUsername =
    (user &&
      "displayUsername" in user &&
      typeof user.displayUsername === "string" &&
      user.displayUsername) ||
    (user && "username" in user && typeof user.username === "string"
      ? user.username
      : "") ||
    "";

  React.useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

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
    if (trimmed.length < 3) {
      setUsernameStatus(trimmed.length === 0 ? "unchanged" : "invalid");
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(trimmed)) {
      setUsernameStatus("invalid");
      return;
    }
    setUsernameStatus("checking");
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data, error } = await authClient.isUsernameAvailable({
          username: trimmed,
        });
        if (error) {
          setUsernameStatus("idle");
          return;
        }
        setUsernameStatus(data?.available ? "available" : "taken");
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [username, currentUsername]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimmedUsername = username.trim();
    const namePayload = name.trim() || user.name;
    const usernameChanged = trimmedUsername !== currentUsername.trim();

    if (usernameChanged) {
      if (trimmedUsername.length < 3) {
        toast.error(t("usernameTooShort"));
        return;
      }
      if (!/^[a-zA-Z0-9_.]+$/.test(trimmedUsername)) {
        toast.error(t("usernameInvalid"));
        return;
      }
      if (usernameStatus !== "available") {
        const { data } = await authClient.isUsernameAvailable({
          username: trimmedUsername,
        });
        if (!data?.available) {
          toast.error(t("usernameTaken"));
          return;
        }
      }
    }

    setSaving(true);
    try {
      const { error } = await authClient.updateUser({
        name: namePayload,
        ...(usernameChanged ? { username: trimmedUsername } : {}),
      });
      if (error) {
        const code = error.code;
        if (code === "USERNAME_IS_ALREADY_TAKEN") {
          toast.error(t("usernameTaken"));
          return;
        }
        toast.error(error.message ?? t("saveError"));
        return;
      }
      toast.success(t("saved"));
    } finally {
      setSaving(false);
    }
  }


  if (sessionPending && !user) {
    return (
      <Card id="profile" className="scroll-mt-32 border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!user) return null;

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
              {username.trim().length >= 3 &&
              username.trim() !== currentUsername.trim() ? (
                <FieldDescription
                  className={
                    usernameStatus === "taken" || usernameStatus === "invalid"
                      ? "text-destructive"
                      : usernameStatus === "available"
                        ? "text-emerald-600 dark:text-emerald-500"
                        : undefined
                  }
                >
                  {usernameStatus === "checking"
                    ? t("usernameChecking")
                    : usernameStatus === "available"
                      ? t("usernameAvailable")
                      : usernameStatus === "taken"
                        ? t("usernameTaken")
                        : usernameStatus === "invalid"
                          ? t("usernameInvalidHint")
                          : null}
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <Button type="submit" disabled={saving || !isDirty}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
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
