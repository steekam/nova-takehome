CREATE TABLE "lesson_plan_retrieval_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_plan_id" uuid NOT NULL,
	"resource_chunk_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_plan_retrieval_candidates" ADD CONSTRAINT "lesson_plan_retrieval_candidates_lesson_plan_id_lesson_plans_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan_retrieval_candidates" ADD CONSTRAINT "lesson_plan_retrieval_candidates_resource_chunk_id_library_resource_chunks_id_fk" FOREIGN KEY ("resource_chunk_id") REFERENCES "public"."library_resource_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_plan_retrieval_candidates_plan_chunk_idx" ON "lesson_plan_retrieval_candidates" USING btree ("lesson_plan_id","resource_chunk_id");--> statement-breakpoint
WITH initial_versions AS (
	SELECT DISTINCT ON (lesson_plan_id) lesson_plan_id, target_revision_id, content
	FROM lesson_plan_versions
	ORDER BY lesson_plan_id, version ASC
)
INSERT INTO lesson_plan_retrieval_candidates (lesson_plan_id, resource_chunk_id)
SELECT DISTINCT versions.lesson_plan_id, chunks.id
FROM initial_versions AS versions
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(versions.content->'sources', '[]'::jsonb)) AS citation(item)
INNER JOIN library_resource_chunks AS chunks ON chunks.id::text = citation.item->>'chunkId'
INNER JOIN library_resource_revisions AS revisions ON revisions.id = chunks.resource_revision_id
INNER JOIN library_resources AS resources ON resources.id = revisions.resource_id
WHERE versions.target_revision_id IS NOT NULL
	AND resources.id::text = citation.item->>'documentId'
ON CONFLICT (lesson_plan_id, resource_chunk_id) DO NOTHING;
