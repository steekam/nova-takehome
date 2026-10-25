ALTER TABLE "library_resource_revisions" ADD COLUMN "source_locator" text;--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ADD COLUMN "resource_metadata" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ADD COLUMN "source_format" text DEFAULT 'plain_text' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ADD COLUMN "parser_version" text DEFAULT 'plain-text-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ADD COLUMN "chunker_version" text DEFAULT 'paragraph-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ADD COLUMN "embedding_model" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_resources" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TYPE "library_resource_type" RENAME VALUE 'assessment_item' TO 'assessment_items';--> statement-breakpoint
CREATE INDEX "library_resource_revisions_metadata_idx" ON "library_resource_revisions" USING gin ("resource_metadata");--> statement-breakpoint
CREATE UNIQUE INDEX "library_resources_source_key_idx" ON "library_resources" ("source_key") WHERE "source_key" is not null;
