ALTER TABLE "library_resource_revisions" ADD COLUMN "pipeline_fingerprint" text;--> statement-breakpoint
UPDATE "library_resource_revisions" SET "pipeline_fingerprint" = "content_hash";--> statement-breakpoint
ALTER TABLE "library_resource_revisions" ALTER COLUMN "pipeline_fingerprint" SET NOT NULL;
