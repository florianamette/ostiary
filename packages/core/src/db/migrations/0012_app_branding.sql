CREATE TABLE "oauth_client_branding" (
	"client_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"tagline" text,
	"accent_color" text,
	"logo_source" text DEFAULT 'app_icon' NOT NULL,
	"logo_url" text,
	"logo_content_type" text,
	"logo_data" "bytea",
	"panel_text" text,
	"panel_image_content_type" text,
	"panel_image_data" "bytea",
	"social_providers" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "oauth_client_branding" ADD CONSTRAINT "oauth_client_branding_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_branding" ADD CONSTRAINT "oauth_client_branding_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;