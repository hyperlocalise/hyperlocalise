ALTER TABLE "memory_import_attempts" ALTER COLUMN "source_sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "operation" text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "mode" text DEFAULT 'apply' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "source_object_location" text;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "source_object_key" text;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "result_object_location" text;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "result_object_key" text;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "result_filename" text;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "result_content_type" text;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "failure_message" text;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD COLUMN "processing_started_at" timestamp with time zone;