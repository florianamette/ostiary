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
  "user.reset_two_factor": "Reset two-factor authentication",
  "user.export_data": "Exported account data",
  "user.self_delete": "Deleted their own account",
  "oauth_client.create": "Registered OAuth client",
  "oauth_client.update": "Updated OAuth client",
  "oauth_client.delete": "Deleted OAuth client",
  "oauth_client.rotate_secret": "Rotated client secret",
  "oauth_client.self_register": "Client registered itself",
  "oauth_client.disable": "Disabled OAuth client",
  "oauth_client.enable": "Enabled OAuth client",
  "oauth_client.branding_update": "Changed sign-in branding",
  "oauth_client.branding_reset": "Reset sign-in branding",
  "client_registration.update": "Changed client self-registration",
  "oauth_resource.create": "Registered API",
  "oauth_resource.update": "Updated API",
  "oauth_resource.delete": "Deleted API",
  "oauth_resource.access": "Changed API access",
  "oauth_resource.tokens": "Changed API token settings",
  "api_key.create": "Created API key",
  "api_key.revoke": "Revoked API key",
  "api_key.revoke_all": "Revoked all API keys",
  "api_key.settings": "Changed API key settings",
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
  "social_provider.create": "Set up sign-in provider",
  "social_provider.update": "Updated sign-in provider",
  "social_provider.delete": "Removed sign-in provider",
  "social_provider.reorder": "Reordered sign-in providers",
  "scim.token_create": "Generated SCIM token",
  "scim.token_rotate": "Replaced SCIM token",
  "scim.token_revoke": "Revoked SCIM token",
  "signing_key.rotate": "Rotated signing key",
  "signing_key.update_settings": "Changed signing key rotation",
  "webhook.create": "Added webhook endpoint",
  "webhook.update": "Updated webhook endpoint",
  "webhook.enable": "Enabled webhook endpoint",
  "webhook.disable": "Disabled webhook endpoint",
  "webhook.delete": "Deleted webhook endpoint",
  "webhook.rotate_secret": "Regenerated webhook secret",
  "webhook.test": "Sent webhook test event",
  "webhook.redeliver": "Redelivered webhook event",
};
