ALTER TABLE "apikey" DROP CONSTRAINT "apikey_reference_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "user_id" text GENERATED ALWAYS AS (CASE WHEN config_id = 'organization' THEN NULL ELSE reference_id END) STORED;--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "organization_id" text GENERATED ALWAYS AS (CASE WHEN config_id = 'organization' THEN reference_id ELSE NULL END) STORED;--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apikey_userId_idx" ON "apikey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_organizationId_idx" ON "apikey" USING btree ("organization_id");