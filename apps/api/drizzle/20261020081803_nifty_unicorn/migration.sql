CREATE TYPE "public"."curriculum_design_origin" AS ENUM('official_import', 'demo_fixture');--> statement-breakpoint
CREATE TYPE "public"."curriculum_design_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."curriculum_level_kind" AS ENUM('grade', 'stage', 'year', 'qualification');--> statement-breakpoint
CREATE TYPE "public"."curriculum_node_kind" AS ENUM('strand', 'sub_strand', 'topic', 'subtopic', 'unit', 'section');--> statement-breakpoint
CREATE TYPE "public"."curriculum_source_link_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."curriculum_source_role" AS ENUM('defines_target', 'teaching_support', 'assessment_support', 'guidance', 'exemplar');--> statement-breakpoint
CREATE TYPE "public"."curriculum_target_kind" AS ENUM('specific_learning_outcome', 'learning_objective', 'syllabus_content_point');--> statement-breakpoint
CREATE TYPE "public"."library_authority" AS ENUM('official', 'school', 'internal', 'synthetic');--> statement-breakpoint
CREATE TYPE "public"."library_resource_type" AS ENUM('curriculum_design', 'scheme_of_work', 'assessment_item', 'teaching_note', 'lead_guidance', 'exemplar');--> statement-breakpoint
CREATE TYPE "public"."library_revision_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TABLE "curriculum_design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"source_resource_revision_id" uuid,
	"edition_label" text NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"origin" "curriculum_design_origin" NOT NULL,
	"status" "curriculum_design_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"authority" text NOT NULL,
	CONSTRAINT "curriculum_frameworks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "curriculum_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"kind" "curriculum_level_kind" NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_version_id" uuid NOT NULL,
	"parent_node_id" uuid,
	"kind" "curriculum_node_kind" NOT NULL,
	"code" text,
	"label" text NOT NULL,
	"source_locator" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"level_id" uuid,
	"subject_id" uuid NOT NULL,
	"external_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_revision_id" uuid NOT NULL,
	"resource_revision_id" uuid NOT NULL,
	"role" "curriculum_source_role" NOT NULL,
	"status" "curriculum_source_link_status" DEFAULT 'draft' NOT NULL,
	"added_by" uuid NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_target_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_version_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"kind" "curriculum_target_kind" NOT NULL,
	"code" text,
	"source_locator" text NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_plan_version_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_plan_version_id" uuid NOT NULL,
	"resource_chunk_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_resource_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"locator" text,
	"content" text NOT NULL,
	"embedding" vector(384) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_resource_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"edition_label" text,
	"source_url" text,
	"content_hash" text NOT NULL,
	"content" text NOT NULL,
	"status" "library_revision_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" "library_resource_type" NOT NULL,
	"title" text NOT NULL,
	"authority" "library_authority" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_plan_versions" ADD COLUMN "target_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD COLUMN "lesson_plan_version_id" uuid;--> statement-breakpoint
INSERT INTO "library_resources" ("id", "resource_type", "title", "authority", "created_at")
SELECT "id",
  CASE "document_type"::text WHEN 'learning_outcome' THEN 'curriculum_design'::"library_resource_type" ELSE "document_type"::text::"library_resource_type" END,
  "title", 'synthetic', "created_at"
FROM "curriculum_documents"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "library_resource_revisions" ("id", "resource_id", "revision_number", "edition_label", "content_hash", "content", "status", "published_at", "created_at")
SELECT "id", "id", 1, 'Legacy import', md5("content"), "content", 'published', "created_at", "created_at"
FROM "curriculum_documents"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "library_resource_chunks" ("id", "resource_revision_id", "ordinal", "content", "embedding")
SELECT "id", "document_id", "ordinal", "content", "embedding"
FROM "curriculum_chunks"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "lesson_plan_version_sources" ("lesson_plan_version_id", "resource_chunk_id")
SELECT DISTINCT versions."id", chunks."id"
FROM "lesson_plan_versions" AS versions
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(versions."content"->'sources') = 'array' THEN versions."content"->'sources' ELSE '[]'::jsonb END
) AS citations(source)
 CROSS JOIN LATERAL (
  SELECT
    CASE WHEN citations.source->>'chunkId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (citations.source->>'chunkId')::uuid END AS "chunk_id",
    CASE WHEN citations.source->>'documentId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (citations.source->>'documentId')::uuid END AS "document_id"
 ) AS citation_ids
JOIN "library_resource_chunks" AS chunks
  ON chunks."id" = citation_ids."chunk_id"
 AND chunks."resource_revision_id" = citation_ids."document_id"
WHERE citation_ids."chunk_id" IS NOT NULL AND citation_ids."document_id" IS NOT NULL;--> statement-breakpoint
WITH review_versions AS (
  SELECT reviews."id",
    COALESCE(
      (SELECT versions."id" FROM "lesson_plan_versions" AS versions
       WHERE versions."lesson_plan_id" = reviews."lesson_plan_id" AND versions."created_at" <= reviews."created_at"
       ORDER BY versions."created_at" DESC, versions."version" DESC LIMIT 1),
      (SELECT versions."id" FROM "lesson_plan_versions" AS versions
       WHERE versions."lesson_plan_id" = reviews."lesson_plan_id"
       ORDER BY versions."created_at", versions."version" LIMIT 1)
    ) AS "version_id"
  FROM "plan_reviews" AS reviews
)
UPDATE "plan_reviews" AS reviews
SET "lesson_plan_version_id" = review_versions."version_id"
FROM review_versions
WHERE reviews."id" = review_versions."id";--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "plan_reviews" WHERE "lesson_plan_version_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill exact lesson-plan version for every review';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "plan_reviews" ALTER COLUMN "lesson_plan_version_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "curriculum_design_versions" ADD CONSTRAINT "curriculum_design_versions_offering_id_curriculum_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."curriculum_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_design_versions" ADD CONSTRAINT "curriculum_design_versions_source_resource_revision_id_library_resource_revisions_id_fk" FOREIGN KEY ("source_resource_revision_id") REFERENCES "public"."library_resource_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_design_versions" ADD CONSTRAINT "curriculum_design_versions_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."curriculum_design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_levels" ADD CONSTRAINT "curriculum_levels_programme_id_curriculum_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."curriculum_programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_design_version_id_curriculum_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."curriculum_design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_offerings" ADD CONSTRAINT "curriculum_offerings_programme_id_curriculum_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."curriculum_programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_offerings" ADD CONSTRAINT "curriculum_offerings_level_id_curriculum_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."curriculum_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_offerings" ADD CONSTRAINT "curriculum_offerings_subject_id_curriculum_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."curriculum_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_programmes" ADD CONSTRAINT "curriculum_programmes_framework_id_curriculum_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."curriculum_frameworks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_source_links" ADD CONSTRAINT "curriculum_source_links_target_revision_id_curriculum_target_revisions_id_fk" FOREIGN KEY ("target_revision_id") REFERENCES "public"."curriculum_target_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_source_links" ADD CONSTRAINT "curriculum_source_links_resource_revision_id_library_resource_revisions_id_fk" FOREIGN KEY ("resource_revision_id") REFERENCES "public"."library_resource_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_source_links" ADD CONSTRAINT "curriculum_source_links_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_source_links" ADD CONSTRAINT "curriculum_source_links_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_framework_id_curriculum_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."curriculum_frameworks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_target_revisions" ADD CONSTRAINT "curriculum_target_revisions_design_version_id_curriculum_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."curriculum_design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan_version_sources" ADD CONSTRAINT "lesson_plan_version_sources_lesson_plan_version_id_lesson_plan_versions_id_fk" FOREIGN KEY ("lesson_plan_version_id") REFERENCES "public"."lesson_plan_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan_version_sources" ADD CONSTRAINT "lesson_plan_version_sources_resource_chunk_id_library_resource_chunks_id_fk" FOREIGN KEY ("resource_chunk_id") REFERENCES "public"."library_resource_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource_chunks" ADD CONSTRAINT "library_resource_chunks_resource_revision_id_library_resource_revisions_id_fk" FOREIGN KEY ("resource_revision_id") REFERENCES "public"."library_resource_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ADD CONSTRAINT "library_resource_revisions_resource_id_library_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ADD CONSTRAINT "library_resource_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_design_versions_offering_edition_revision_idx" ON "curriculum_design_versions" USING btree ("offering_id","edition_label","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_levels_programme_code_idx" ON "curriculum_levels" USING btree ("programme_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_nodes_id_design_version_idx" ON "curriculum_nodes" USING btree ("id","design_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_nodes_version_locator_idx" ON "curriculum_nodes" USING btree ("design_version_id","source_locator");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_offerings_context_idx" ON "curriculum_offerings" USING btree ("programme_id","level_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_programmes_framework_code_idx" ON "curriculum_programmes" USING btree ("framework_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_source_links_target_resource_role_idx" ON "curriculum_source_links" USING btree ("target_revision_id","resource_revision_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_subjects_framework_code_idx" ON "curriculum_subjects" USING btree ("framework_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_target_revisions_version_locator_idx" ON "curriculum_target_revisions" USING btree ("design_version_id","source_locator");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_plan_version_sources_version_chunk_idx" ON "lesson_plan_version_sources" USING btree ("lesson_plan_version_id","resource_chunk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_resource_chunks_revision_ordinal_idx" ON "library_resource_chunks" USING btree ("resource_revision_id","ordinal");--> statement-breakpoint
CREATE INDEX "library_resource_chunks_embedding_hnsw_idx" ON "library_resource_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "library_resource_revisions_resource_revision_idx" ON "library_resource_revisions" USING btree ("resource_id","revision_number");--> statement-breakpoint
ALTER TABLE "lesson_plan_versions" ADD CONSTRAINT "lesson_plan_versions_target_revision_id_curriculum_target_revisions_id_fk" FOREIGN KEY ("target_revision_id") REFERENCES "public"."curriculum_target_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_plan_versions_id_plan_idx" ON "lesson_plan_versions" USING btree ("id","lesson_plan_id");--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_parent_same_version_fk" FOREIGN KEY ("parent_node_id","design_version_id") REFERENCES "public"."curriculum_nodes"("id","design_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_target_revisions" ADD CONSTRAINT "curriculum_target_revisions_node_same_version_fk" FOREIGN KEY ("node_id","design_version_id") REFERENCES "public"."curriculum_nodes"("id","design_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_version_same_plan_fk" FOREIGN KEY ("lesson_plan_version_id","lesson_plan_id") REFERENCES "public"."lesson_plan_versions"("id","lesson_plan_id") ON DELETE no action ON UPDATE no action;
