ALTER TABLE "oauth_client" ADD COLUMN "admin_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: a client registered before this column existed is admin-registered when it is not
-- self-registered (no metadata document, no dynamic registration marker) and an admin made it:
-- the admin console logged its creation, or its owner is an admin today, or it has no owner
-- (an admin's app kept when that admin's account was deleted). Clients that ordinary users
-- created through Better Auth's client endpoints stay self-registered.
UPDATE "oauth_client" AS c
SET "admin_registered" = true
WHERE c."client_discovery_id" IS DISTINCT FROM 'cimd'
  AND coalesce(c."metadata"::text, '') NOT LIKE '%ostiary_registration%dynamic%'
  AND (
    c."user_id" IS NULL
    OR EXISTS (
      SELECT 1 FROM "audit_log" a
      WHERE a."action" = 'oauth_client.create'
        AND a."target_type" = 'oauth_client'
        AND a."target_id" = c."client_id"
    )
    OR EXISTS (
      SELECT 1 FROM "user" u
      WHERE u."id" = c."user_id"
        AND 'admin' = ANY (string_to_array(replace(coalesce(u."role", ''), ' ', ''), ','))
    )
  );--> statement-breakpoint
-- Admin-registered clients belong to the platform (every current admin), not to the admin who
-- created them: Better Auth's client endpoints only let its `clientReference` manage them.
UPDATE "oauth_client"
SET "reference_id" = 'ostiary:platform', "user_id" = NULL
WHERE "admin_registered" = true;
