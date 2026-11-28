CREATE TABLE "account_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"session_id" text,
	"new_device" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_event" ADD CONSTRAINT "account_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_event_user_id_created_at_idx" ON "account_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "account_event_created_at_idx" ON "account_event" USING btree ("created_at");