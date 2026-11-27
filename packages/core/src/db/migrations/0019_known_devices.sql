CREATE TABLE "known_device" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "known_device" ADD CONSTRAINT "known_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "known_device_user_device_idx" ON "known_device" USING btree ("user_id","device_hash");--> statement-breakpoint
CREATE INDEX "known_device_last_seen_at_idx" ON "known_device" USING btree ("last_seen_at");