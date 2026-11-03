ALTER TABLE "projects" ADD COLUMN "source_text_editable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD COLUMN "sync_report" jsonb;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD COLUMN "imported_source_text" text;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD COLUMN "hidden_by_sync_at" timestamp with time zone;