CREATE TABLE "throttle_counters" (
	"key" text,
	"name" text,
	"window_started_at" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL,
	"blocked_until" timestamp with time zone,
	CONSTRAINT "throttle_counters_pkey" PRIMARY KEY("key","name")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "family_id" uuid;--> statement-breakpoint
UPDATE "auth_sessions" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "is_current" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_sessions_family_idx" ON "auth_sessions" ("family_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX "throttle_counters_window_started_idx" ON "throttle_counters" ("window_started_at");