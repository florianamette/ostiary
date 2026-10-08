import { headers } from "next/headers";

import { recordAudit, type AuditEntry } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { requireAdminSession } from "@/lib/require-admin-session";

/**
 * For admin server actions: checks the caller is an admin and returns a function that
 * records an audit entry in their name, with their IP.
 */
export async function adminActor() {
  const session = await requireAdminSession();
  const ip = clientIp(await headers());
  const actor = { id: session.user.id, email: session.user.email };
  return {
    session,
    audit: (entry: Omit<AuditEntry, "actor" | "ipAddress">) =>
      recordAudit({ ...entry, actor, ipAddress: ip }),
  };
}

/** Human-readable label for an audit action. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.create": "Created user",
  "user.update": "Updated user",
  "user.set_role": "Changed role",
  "user.set_password": "Set password",
  "user.ban": "Banned user",
  "user.unban": "Unbanned user",
  "user.delete": "Deleted user",
  "user.revoke_session": "Revoked a session",
  "user.revoke_all_sessions": "Signed user out everywhere",
  "user.impersonate": "Impersonated user",
  "oauth_client.create": "Registered OAuth client",
  "oauth_client.update": "Updated OAuth client",
  "oauth_client.delete": "Deleted OAuth client",
  "oauth_client.rotate_secret": "Rotated client secret",
  "oauth_resource.create": "Registered API",
  "oauth_resource.update": "Updated API",
  "oauth_resource.delete": "Deleted API",
  "oauth_consent.update": "Updated consent",
  "oauth_consent.delete": "Revoked consent",
  "oauth_device.approve": "Approved a device sign-in",
  "oauth_device.deny": "Denied a device sign-in",
  "organization.create": "Created organization",
  "organization.update": "Renamed organization",
  "organization.delete": "Deleted organization",
  "organization.invite": "Invited member",
  "organization.cancel_invitation": "Cancelled invitation",
  "organization.update_member_role": "Changed member role",
  "organization.remove_member": "Removed member",
  "sso_provider.create": "Registered SSO provider",
  "sso_provider.update": "Updated SSO provider",
  "sso_provider.delete": "Deleted SSO provider",
  "sso_provider.verify_domain": "Verified SSO domain",
};
