"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

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
  PUBLIC_ORGANIZATION_ID,
  PUBLIC_ORGANIZATION_SLUG,
} from "@ostiary/core/lib/organization-public";
import { deleteOrganization } from "@/app/[locale]/(console)/organizations/actions";
import { ListPagination, UrlListSearch } from "@/components/admin/common/admin-table";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";
import { useAdminAction } from "@/components/admin/common/use-admin-action";
import { authClient } from "@/lib/auth-client";

type OrgRow = { id: string; name: string; slug: string; members: number };

/**
 * Creating organizations is an admin-only action: the server rejects it for other users
 * (see allowUserToCreateOrganization in the auth factory), and this panel lives only in
 * the admin app.
 */
export function AdminOrganizationsPanel({
  organizations,
  total,
  searching,
}: {
  /** One page of organizations, from the URL (`?q=`, `?page=`, `?size=`). */
  organizations: OrgRow[];
  total: number;
  searching: boolean;
}) {
  const t = useTranslations("dashboard.organizations");
  const tList = useTranslations("admin.pages.organizations.list");
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<OrgRow | null>(null);

  const remove = useAdminAction(() => setPendingDelete(null));
  const create = useAdminAction(() => {
    setName("");
    setSlug("");
  });
  const creating = create.busy;

  function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    void remove.run(() => deleteOrganization(target.id), t("deleted"), t("deleteError"));
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
    void create.run(
      async () => {
        const check = await authClient.organization.checkSlug({ slug: normalizedSlug });
        if (check.error) return { ok: false, error: check.error.message || t("slugTaken") };
        return authClient.organization.create({
          name: trimmedName,
          slug: normalizedSlug,
          keepCurrentActiveOrganization: true,
        });
      },
      t("createSuccess"),
      t("createError"),
    );
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
            <Button type="submit" loading={creating}>
              {creating ? t("creating") : t("create")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("allOrganizations")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UrlListSearch placeholder={tList("searchPlaceholder")} label={tList("searchLabel")} />
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{searching ? tList("noMatch") : t("empty")}</p>
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
        {total > organizations.length ? <ListPagination total={total} /> : null}
      </Card>

      <ConfirmRemoveDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("confirmDeleteTitle", { name: pendingDelete?.name ?? "" })}
        description={t("confirmDeleteBody", { count: pendingDelete?.members ?? 0 })}
        pending={remove.busy}
        onConfirm={confirmDelete}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}
