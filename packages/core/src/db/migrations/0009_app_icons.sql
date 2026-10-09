CREATE TABLE "app_icon" (
	"source" text PRIMARY KEY NOT NULL,
	"content_type" text,
	"data" "bytea",
	"error" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
