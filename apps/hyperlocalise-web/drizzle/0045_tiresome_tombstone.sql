CREATE TYPE "public"."project_translation_provenance" AS ENUM('manual', 'translation_job', 'import', 'agent');--> statement-breakpoint
CREATE TYPE "public"."project_translation_status" AS ENUM('draft', 'needs_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "project_translation_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"repository_source_file_id" uuid,
	"key" text NOT NULL,
	"source_text" text NOT NULL,
	"normalized_source_text" text NOT NULL,
	"context" text,
	"type" text,
	"max_length" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_file_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"translation_key_id" uuid NOT NULL,
	"target_locale" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" "project_translation_status" DEFAULT 'draft' NOT NULL,
	"provenance" "project_translation_provenance" DEFAULT 'manual' NOT NULL,
	"source_job_id" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD CONSTRAINT "project_translation_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD CONSTRAINT "project_translation_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD CONSTRAINT "project_translation_keys_repository_source_file_id_repository_source_files_id_fk" FOREIGN KEY ("repository_source_file_id") REFERENCES "public"."repository_source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD CONSTRAINT "project_translation_keys_source_file_version_id_repository_source_file_versions_id_fk" FOREIGN KEY ("source_file_version_id") REFERENCES "public"."repository_source_file_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_translation_keys_project_file_key" ON "project_translation_keys" USING btree ("project_id","repository_source_file_id","key");--> statement-breakpoint
CREATE INDEX "idx_project_translation_keys_org_project" ON "project_translation_keys" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_translation_keys_file" ON "project_translation_keys" USING btree ("repository_source_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_translations_key_locale" ON "project_translations" USING btree ("translation_key_id","target_locale");--> statement-breakpoint
CREATE INDEX "idx_project_translations_org_project" ON "project_translations" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_translations_status" ON "project_translations" USING btree ("project_id","status");