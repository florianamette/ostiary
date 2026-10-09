"use client";

import * as React from "react";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ostiary/core/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";

export function AdminCreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("admin.pages.users.create");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"user" | "admin">("user");
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  function reset() {
    setEmail("");
    setPassword("");
    setName("");
    setRole("user");
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      const { error } = await authClient.admin.createUser({
        email: email.trim(),
        password,
        name: name.trim(),
        role,
        data: { emailVerified: true },
      });
      if (error) {
        setFormError(error.message ?? t("error"));
        return;
      }
      adminNotify(t("created"));
      setOpen(false);
      reset();
      onCreated();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          <UserPlusIcon />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t.rich("description", {
                code: (chunks) => <code className="text-foreground">{chunks}</code>,
              })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="admin-create-email">{t("email")}</FieldLabel>
              <Input
                id="admin-create-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-create-password">{t("password")}</FieldLabel>
              <Input
                id="admin-create-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-create-name">{t("name")}</FieldLabel>
              <Input
                id="admin-create-name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("role")}</FieldLabel>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "user" | "admin")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {formError ? (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("creating") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
