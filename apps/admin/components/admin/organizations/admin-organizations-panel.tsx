"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Link } from "@/i18n/navigation";
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
import { Field, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import {
  PUBLIC_ORGANIZATION_ID,
  PUBLIC_ORGANIZATION_SLUG,
} from "@ostiary/core/lib/organization-public";
import { deleteOrganization } from "@/app/[locale]/(console)/organizations/actions";
import { authClient } from "@/lib/auth-client";

type OrgRow = { id: string; name: string; slug: string; members: number };

/**
 * Creating organizations is an admin-only action: the server rejects it for other users
 * (see allowUserToCreateOrganization in the auth factory), and this panel lives only in
 * the admin app.
 */
export function AdminOrganizationsPanel({ organizations }: { organizations: OrgRow[] }) {
  const t = useTranslations("dashboard.organizations");
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<OrgRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { ok } = await deleteOrganization(pendingDelete.id);
      if (!ok) {
        toast.error(t("deleteError"));
        return;
      }
      toast.success(t("deleted"));
      setPendingDelete(null);
      router.refresh();
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmedName || !normalizedSlug) {
      toast.error(t("createValidation"));
      return;
    }
    if (normalizedSlug === PUBLIC_ORGANIZATION_SLUG) {
      toast.error(t("reservedSlug"));
      return;
    }
    setCreating(true);
    try {
      const check = await authClient.organization.checkSlug({ slug: normalizedSlug });
      if (check.error) {
        toast.error(String(check.error.message ?? t("slugTaken")));
        return;
      }
      const { error } = await authClient.organization.create({
        name: trimmedName,
        slug: normalizedSlug,
        keepCurrentActiveOrganization: true,
      });
      if (error) {
        toast.error(String(error.message ?? t("createError")));
        return;
      }
      toast.success(t("createSuccess"));
      setName("");
      setSlug("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("createTitle")}</CardTitle>
          <CardDescription>{t("createHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="admin-org-name">{t("orgName")}</FieldLabel>
              <Input
                id="admin-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={creating}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-org-slug">{t("orgSlug")}</FieldLabel>
              <Input
                id="admin-org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={creating}
                autoComplete="off"
              />
            </Field>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {creating ? t("creating") : t("create")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("allOrganizations")}</CardTitle>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {organizations.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link href={`/organizations/${o.id}`} className="block truncate text-sm font-medium underline-offset-4 hover:underline">
                      {o.name}
                    </Link>
                    <p className="truncate font-mono text-xs text-muted-foreground">{o.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t("memberCount", { count: o.members })}
                    </span>
                    {o.id === PUBLIC_ORGANIZATION_ID ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("delete")}
                        onClick={() => setPendingDelete(o)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("confirmDeleteTitle", { name: pendingDelete?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("confirmDeleteBody", { count: pendingDelete?.members ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
