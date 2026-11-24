CREATE TABLE "organization_policy" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"require_two_factor" boolean DEFAULT false NOT NULL,
	"require_two_factor_since" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "organization_policy" ADD CONSTRAINT "organization_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_policy" ADD CONSTRAINT "organization_policy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;