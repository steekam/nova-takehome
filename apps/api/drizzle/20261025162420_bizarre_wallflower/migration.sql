ALTER TABLE "curriculum_chunks" DROP CONSTRAINT "curriculum_chunks_document_id_curriculum_documents_id_fk";--> statement-breakpoint
DROP TABLE "curriculum_chunks";--> statement-breakpoint
DROP TABLE "curriculum_documents";--> statement-breakpoint
DROP TYPE "curriculum_document_type";