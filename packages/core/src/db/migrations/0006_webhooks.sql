CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"locked_until" timestamp,
	"last_attempt_at" timestamp,
	"response_status" integer,
	"response_excerpt" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"events" jsonb NOT NULL,
	"secret_encrypted" text NOT NULL,
	"previous_secret_encrypted" text,
	"previous_secret_expires_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"disabled_reason" text,
	"disabled_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhookDelivery_due_idx" ON "webhook_delivery" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhookDelivery_endpoint_idx" ON "webhook_delivery" USING btree ("endpoint_id","created_at");