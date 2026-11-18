-- Every timestamp becomes timestamptz. Ostiary always stored UTC in these columns (Drizzle
-- writes Date.toISOString() and reads them back as UTC), so each value is read AT TIME ZONE 'UTC'
-- rather than in the database session's time zone. The tables are rewritten once.
--
-- Clients, resources and client resources without a creation date (written by older versions)
-- get their last update or the migration time before created_at becomes NOT NULL.
UPDATE "oauth_client" SET "created_at" = COALESCE("updated_at", now()) WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "oauth_resource" SET "created_at" = COALESCE("updated_at", now()) WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "oauth_client_resource" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
DROP INDEX "oauthAccessToken_clientId_idx";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "access_token_expires_at" SET DATA TYPE timestamp with time zone USING "access_token_expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE timestamp with time zone USING "refresh_token_expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "device_code" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "device_code" ALTER COLUMN "last_polled_at" SET DATA TYPE timestamp with time zone USING "last_polled_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "revoked" SET DATA TYPE timestamp with time zone USING "revoked" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_client" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_client" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_client" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_client" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_client_assertion" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "revoked" SET DATA TYPE timestamp with time zone USING "revoked" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "rotated_at" SET DATA TYPE timestamp with time zone USING "rotated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "rotation_replay_expires_at" SET DATA TYPE timestamp with time zone USING "rotation_replay_expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "auth_time" SET DATA TYPE timestamp with time zone USING "auth_time" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_resource" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_resource" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_resource" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_resource" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "passkey" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "passkey" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "two_factor" ALTER COLUMN "locked_until" SET DATA TYPE timestamp with time zone USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "ban_expires" SET DATA TYPE timestamp with time zone USING "ban_expires" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "scim_connection_binding" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_connection_binding" ALTER COLUMN "decommissioned_at" SET DATA TYPE timestamp with time zone USING "decommissioned_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_connection_binding" ALTER COLUMN "decommission_completed_at" SET DATA TYPE timestamp with time zone USING "decommission_completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_connection_binding" ALTER COLUMN "decommission_lease_expires_at" SET DATA TYPE timestamp with time zone USING "decommission_lease_expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_group" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_group" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_group_member" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_identity_tombstone" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone USING "deleted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_connection" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_connection" ALTER COLUMN "decommission_started_at" SET DATA TYPE timestamp with time zone USING "decommission_started_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_connection" ALTER COLUMN "decommissioned_at" SET DATA TYPE timestamp with time zone USING "decommissioned_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_connection_event" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_credential" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_credential" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_credential" ALTER COLUMN "last_used_at" SET DATA TYPE timestamp with time zone USING "last_used_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_credential" ALTER COLUMN "revoked_at" SET DATA TYPE timestamp with time zone USING "revoked_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_managed_credential" ALTER COLUMN "decommissioned_at" SET DATA TYPE timestamp with time zone USING "decommissioned_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_projection_grant" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_projection_grant" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_subject" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_subject" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_user" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "scim_user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "auth_event" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "auth_event" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "app_setting" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "app_setting" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "webhook_delivery" ALTER COLUMN "next_attempt_at" SET DATA TYPE timestamp with time zone USING "next_attempt_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_delivery" ALTER COLUMN "locked_until" SET DATA TYPE timestamp with time zone USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_delivery" ALTER COLUMN "last_attempt_at" SET DATA TYPE timestamp with time zone USING "last_attempt_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_delivery" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_delivery" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "previous_secret_expires_at" SET DATA TYPE timestamp with time zone USING "previous_secret_expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "disabled_at" SET DATA TYPE timestamp with time zone USING "disabled_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "last_success_at" SET DATA TYPE timestamp with time zone USING "last_success_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "last_failure_at" SET DATA TYPE timestamp with time zone USING "last_failure_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "last_refill_at" SET DATA TYPE timestamp with time zone USING "last_refill_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "last_request" SET DATA TYPE timestamp with time zone USING "last_request" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "social_provider" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "social_provider" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "social_provider" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "social_provider" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "app_icon" ALTER COLUMN "fetched_at" SET DATA TYPE timestamp with time zone USING "fetched_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "app_icon" ALTER COLUMN "fetched_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "oauth_client_branding" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "oauth_client_branding" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
-- SSO providers whose organization was deleted keep a dangling id: clear it before the foreign key.
UPDATE "sso_provider" SET "organization_id" = NULL WHERE "organization_id" IS NOT NULL AND "organization_id" NOT IN (SELECT "id" FROM "organization");--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_email_lower_idx" ON "invitation" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "oauthAccessToken_clientId_createdAt_idx" ON "oauth_access_token" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "oauthClient_createdAt_idx" ON "oauth_client" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_activeOrganizationId_idx" ON "session" USING btree ("active_organization_id");--> statement-breakpoint
-- One SSO provider per domain. Two providers claiming the same domain (in any case) are not
-- merged or changed here: the migration stops and names them, so an admin decides which one stays
-- (docs/enterprise-sso.md, "Upgrading").
DO $$
DECLARE
  duplicates text;
BEGIN
  SELECT string_agg(format('%s (providers: %s)', d.domain, d.providers), '; ' ORDER BY d.domain)
    INTO duplicates
    FROM (
      SELECT lower("domain") AS domain, string_agg("provider_id", ', ' ORDER BY "provider_id") AS providers
        FROM "sso_provider"
       GROUP BY lower("domain")
      HAVING count(*) > 1
    ) d;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'Several SSO providers claim the same domain: %', duplicates
      USING HINT = 'Keep one provider per domain: delete or change the domain of the others in the admin console (SSO), then deploy again. See docs/enterprise-sso.md, "Upgrading".';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_domain_lower_uidx" ON "sso_provider" USING btree (lower("domain"));--> statement-breakpoint
CREATE INDEX "auth_event_user_id_created_at_idx" ON "auth_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_event_identifier_lower_idx" ON "auth_event" USING btree (lower("identifier"));--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_prefix_idx" ON "audit_log" USING btree ("action" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "webhookDelivery_created_at_idx" ON "webhook_delivery" USING btree ("created_at");--> statement-breakpoint
-- Keep one delivery per event and endpoint (the first by id) before the unique index.
DELETE FROM "webhook_delivery" a USING "webhook_delivery" b WHERE a."endpoint_id" = b."endpoint_id" AND a."event_id" = b."event_id" AND a."id" > b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "webhookDelivery_endpoint_event_uidx" ON "webhook_delivery" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "apikey_createdBy_idx" ON "apikey" USING btree ("created_by");