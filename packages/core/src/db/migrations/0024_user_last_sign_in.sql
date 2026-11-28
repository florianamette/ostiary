CREATE TABLE "user_last_sign_in" (
	"user_id" text PRIMARY KEY NOT NULL,
	"signed_in_at" timestamp with time zone,
	"locale" text,
	"warned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_last_sign_in" ADD CONSTRAINT "user_last_sign_in_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_last_sign_in_signed_in_at_idx" ON "user_last_sign_in" USING btree ("signed_in_at");