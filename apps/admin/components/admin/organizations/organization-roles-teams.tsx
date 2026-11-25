"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { ORGANIZATION_STATEMENTS, type RolePermissions } from "@ostiary/core/lib/organization-access";

import {
  addTeamMemberAction,
  createRoleAction,
  createTeamAction,
  deleteRoleAction,
  deleteTeamAction,
  removeTeamMemberAction,
  renameTeamAction,
  updateRoleAction,
} from "@/app/[locale]/(console)/organizations/[id]/actions";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

export type CustomRole = { id: string; role: string; permissions: RolePermissions; members: number };
export type TeamWithMembers = { id: string; name: string; members: { userId: string; name: string; email: string }[] };

const RESOURCES = Object.keys(ORGANIZATION_STATEMENTS) as (keyof typeof ORGANIZATION_STATEMENTS)[];

function permissionSummary(permissions: RolePermissions): string {
  return Object.entries(permissions)
    .filter(([, actions]) => actions?.length)
    .map(([resource, actions]) => `${resource}: ${actions!.join(", ")}`)
    .join(" · ");
}

/** The organization's own roles: name and permissions (organization_role). */
export function OrganizationRoles({ orgId, roles }: { orgId: string; roles: CustomRole[] }) {
  const t = useTranslations("admin.pages.organizations.rolesTeams");
  const [editing, setEditing] = React.useState<CustomRole | "new" | null>(null);
  const [removing, setRemoving] = React.useState<CustomRole | null>(null);
  const remove = useAdminAction(() => setRemoving(null));
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t("rolesDescription")}</p>
      {roles.length === 0 ? <p className="text-muted-foreground text-sm">{t("noRoles")}</p> : null}
      <ul className="divide-y divide-border/80">
        {roles.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm font-medium">{r.role}</code>
                <Badge variant="outline">{t("memberCount", { count: r.members })}</Badge>
              </div>
              <p className="text-muted-foreground text-xs">{permissionSummary(r.permissions) || t("noPermissions")}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(r)} aria-label={t("editRole", { role: r.role })}>
                {t("edit")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRemoving(r)} aria-label={t("deleteRole", { role: r.role })}>
                {t("delete")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
        {t("addRole")}
      </Button>
      {editing ? <RoleDialog orgId={orgId} role={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmRemoveDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("deleteRoleTitle", { role: removing?.role ?? "" })}
        description={t("deleteRoleDescription")}
        pending={remove.busy}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => removing && void remove.run(() => deleteRoleAction(orgId, removing.id), t("roleDeleted"))}
      />
    </div>
  );
}

function RoleDialog({ orgId, role, onClose }: { orgId: string; role: CustomRole | null; onClose: () => void }) {
  const t = useTranslations("admin.pages.organizations.rolesTeams");
  const { busy, run } = useAdminAction(onClose);
  const [name, setName] = React.useState("");
  const [granted, setGranted] = React.useState<RolePermissions>(role?.permissions ?? {});
  const toggle = (resource: keyof typeof ORGANIZATION_STATEMENTS, action: string, on: boolean) =>
    setGranted((current) => {
      const actions = new Set(current[resource] ?? []);
      if (on) actions.add(action);
      else actions.delete(action);
      return { ...current, [resource]: [...actions] };
    });

  function save(e: React.FormEvent) {
    e.preventDefault();
    const permissions = Object.fromEntries(Object.entries(granted).filter(([, a]) => a?.length)) as Record<string, string[]>;
    void run(() => (role ? updateRoleAction(orgId, role.id, permissions) : createRoleAction(orgId, name, permissions)), t("roleSaved"));
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{role ? t("editRole", { role: role.role }) : t("addRole")}</DialogTitle>
            <DialogDescription>{t("roleDialogDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {role ? null : (
              <Field>
                <FieldLabel htmlFor="org-role-name">{t("roleName")}</FieldLabel>
                <Input id="org-role-name" required maxLength={32} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="billing-manager" />
                <FieldDescription>{t("roleNameHint")}</FieldDescription>
              </Field>
            )}
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-medium">{t("permissions")}</legend>
              {RESOURCES.map((resource) => (
                <div key={resource} className="grid gap-1">
                  <span className="font-mono text-xs">{resource}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {(ORGANIZATION_STATEMENTS[resource] as readonly string[]).map((action) => {
                      const id = `perm-${resource}-${action}`;
                      return (
                        <label key={action} htmlFor={id} className="flex items-center gap-1.5 text-sm">
                          <input
                            id={id}
                            type="checkbox"
                            className="size-4"
                            aria-label={`${resource} ${action}`}
                            checked={granted[resource]?.includes(action) ?? false}
                            onChange={(e) => toggle(resource, action, e.target.checked)}
                            disabled={busy}
                          />
                          {action}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </fieldset>
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} cancelLabel={t("cancel")} confirmLabel={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The organization's teams and who is in them (team, team_member). */
export function OrganizationTeams({ orgId, teams }: { orgId: string; teams: TeamWithMembers[] }) {
  const t = useTranslations("admin.pages.organizations.rolesTeams");
  const [name, setName] = React.useState("");
  const create = useAdminAction();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("teamsDescription")}</p>
      {teams.length === 0 ? <p className="text-muted-foreground text-sm">{t("noTeams")}</p> : null}
      {teams.map((team) => (
        <TeamCard key={team.id} orgId={orgId} team={team} />
      ))}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await create.run(() => createTeamAction(orgId, name), t("teamCreated"))) setName("");
        }}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor="org-new-team">{t("newTeam")}</FieldLabel>
          <Input id="org-new-team" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} disabled={create.busy} />
        </Field>
        <Button type="submit" loading={create.busy} disabled={!name.trim()}>
          {t("createTeam")}
        </Button>
      </form>
    </div>
  );
}

function TeamCard({ orgId, team }: { orgId: string; team: TeamWithMembers }) {
  const t = useTranslations("admin.pages.organizations.rolesTeams");
  const [email, setEmail] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [teamName, setTeamName] = React.useState(team.name);
  const [removing, setRemoving] = React.useState(false);
  const action = useAdminAction();
  const remove = useAdminAction(() => setRemoving(false));
  return (
    <section className="space-y-3 rounded-md border border-border/80 p-3" aria-label={team.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renaming ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await action.run(() => renameTeamAction(orgId, team.id, teamName), t("teamRenamed"))) setRenaming(false);
            }}
          >
            <Input aria-label={t("teamName")} value={teamName} maxLength={64} onChange={(e) => setTeamName(e.target.value)} />
            <Button type="submit" size="sm" loading={action.busy}>
              {t("save")}
            </Button>
          </form>
        ) : (
          <h4 className="font-medium">{team.name}</h4>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRenaming((v) => !v)} aria-label={t("renameTeam", { team: team.name })}>
            {t("rename")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRemoving(true)} aria-label={t("deleteTeam", { team: team.name })}>
            {t("delete")}
          </Button>
        </div>
      </div>
      <ul className="space-y-1 text-sm">
        {team.members.length === 0 ? <li className="text-muted-foreground">{t("noTeamMembers")}</li> : null}
        {team.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2">
            <span className="truncate">{m.name || m.email} <span className="text-muted-foreground">{m.email}</span></span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("removeFromTeam", { email: m.email, team: team.name })}
              disabled={action.busy}
              onClick={() => void action.run(() => removeTeamMemberAction(orgId, team.id, m.userId), t("teamMemberRemoved"))}
            >
              {t("remove")}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await action.run(() => addTeamMemberAction(orgId, team.id, email), t("teamMemberAdded"))) setEmail("");
        }}
      >
        <Input type="email" aria-label={t("addToTeam", { team: team.name })} placeholder={t("memberEmail")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" size="sm" variant="outline" loading={action.busy} disabled={!email.trim()}>
          {t("add")}
        </Button>
      </form>
      <ConfirmRemoveDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("deleteTeamTitle", { team: team.name })}
        description={t("deleteTeamDescription")}
        pending={remove.busy}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => void remove.run(() => deleteTeamAction(orgId, team.id), t("teamDeleted"))}
      />
    </section>
  );
}
