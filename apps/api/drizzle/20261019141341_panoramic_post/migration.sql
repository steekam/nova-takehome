CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "curriculum_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(384) USING "embedding"::text::vector(384);--> statement-breakpoint
CREATE INDEX "curriculum_chunks_embedding_hnsw_idx" ON "curriculum_chunks" USING hnsw ("embedding" vector_cosine_ops);
