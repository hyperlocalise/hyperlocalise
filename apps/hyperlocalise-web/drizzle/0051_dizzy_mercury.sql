CREATE TYPE "public"."repository_source_file_ingest_state" AS ENUM('pending', 'ingesting', 'ingested', 'skipped', 'failed');--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD COLUMN "ingest_state" "repository_source_file_ingest_state" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD COLUMN "ingest_error" text;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD COLUMN "ingested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD COLUMN "ingest_workflow_run_id" text;--> statement-breakpoint
CREATE INDEX "idx_repository_source_file_versions_ingest_state" ON "repository_source_file_versions" USING btree ("project_id","ingest_state");