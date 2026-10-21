CREATE TABLE "lesson_plan_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_plan_id" uuid NOT NULL,
	"lesson_plan_version_id" uuid NOT NULL,
	"status" text NOT NULL,
	"rubric_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"reviewer_model" text NOT NULL,
	"summary" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_plan_validations" ADD CONSTRAINT "lesson_plan_validations_lesson_plan_id_lesson_plans_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan_validations" ADD CONSTRAINT "lesson_plan_validations_version_same_plan_fk" FOREIGN KEY ("lesson_plan_version_id","lesson_plan_id") REFERENCES "public"."lesson_plan_versions"("id","lesson_plan_id") ON DELETE no action ON UPDATE no action;