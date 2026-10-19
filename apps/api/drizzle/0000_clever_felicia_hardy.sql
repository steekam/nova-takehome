CREATE TYPE "public"."curriculum_document_type" AS ENUM('scheme_of_work', 'learning_outcome', 'assessment_item');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'submitted', 'returned', 'published');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('returned', 'published');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('teacher', 'curriculum_lead');--> statement-breakpoint
CREATE TABLE "curriculum_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "curriculum_document_type" NOT NULL,
	"subject" text NOT NULL,
	"grade" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_plan_id" uuid NOT NULL,
	"curriculum_lead_id" uuid NOT NULL,
	"decision" "review_decision" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "curriculum_chunks" ADD CONSTRAINT "curriculum_chunks_document_id_curriculum_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."curriculum_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan_versions" ADD CONSTRAINT "lesson_plan_versions_lesson_plan_id_lesson_plans_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan_versions" ADD CONSTRAINT "lesson_plan_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_lesson_plan_id_lesson_plans_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_curriculum_lead_id_users_id_fk" FOREIGN KEY ("curriculum_lead_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_chunks_document_ordinal_idx" ON "curriculum_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_plan_versions_plan_version_idx" ON "lesson_plan_versions" USING btree ("lesson_plan_id","version");