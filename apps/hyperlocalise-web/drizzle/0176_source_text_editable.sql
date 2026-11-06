ALTER TABLE "projects" ADD COLUMN "source_text_editable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD COLUMN "imported_source_text" text;