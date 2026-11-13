ALTER TABLE "glossary_import_runs" ADD COLUMN "operation" text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "source_object_location" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "source_object_key" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "result_object_location" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "result_object_key" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "result_filename" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "result_content_type" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "backup_object_location" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "backup_object_key" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD COLUMN "processing_started_at" timestamp with time zone;