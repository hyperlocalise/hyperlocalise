CREATE TYPE "public"."project_translation_origin" AS ENUM('machine', 'machine_post_edited', 'human', 'unknown');--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD COLUMN "origin" "project_translation_origin" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_translations" ADD COLUMN "origin" "project_translation_origin" DEFAULT 'unknown' NOT NULL;