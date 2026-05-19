CREATE TABLE "repository_source_file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_source_file_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"source_path" text NOT NULL,
	"stored_file_id" text NOT NULL,
	"source_hash" text,
	"commit_sha" text,
	"workflow_run_id" text,
	"uploaded_by_user_id" uuid,
	"uploaded_by_api_key_id" uuid,
	"upload_surface" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"source_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "translation_job_details" ADD COLUMN "source_file_version_id" uuid;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD CONSTRAINT "repository_source_file_versions_repository_source_file_id_repository_source_files_id_fk" FOREIGN KEY ("repository_source_file_id") REFERENCES "public"."repository_source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD CONSTRAINT "repository_source_file_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD CONSTRAINT "repository_source_file_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD CONSTRAINT "repository_source_file_versions_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD CONSTRAINT "repository_source_file_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD CONSTRAINT "repository_source_file_versions_uploaded_by_api_key_id_organization_api_keys_id_fk" FOREIGN KEY ("uploaded_by_api_key_id") REFERENCES "public"."organization_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_source_files" ADD CONSTRAINT "repository_source_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_source_files" ADD CONSTRAINT "repository_source_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_source_file_versions_stored_file_key" ON "repository_source_file_versions" USING btree ("stored_file_id");--> statement-breakpoint
CREATE INDEX "idx_repository_source_file_versions_file_created" ON "repository_source_file_versions" USING btree ("repository_source_file_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_repository_source_file_versions_project_path_created" ON "repository_source_file_versions" USING btree ("project_id","source_path","created_at");--> statement-breakpoint
CREATE INDEX "idx_repository_source_file_versions_workflow_run" ON "repository_source_file_versions" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_repository_source_file_versions_api_key" ON "repository_source_file_versions" USING btree ("uploaded_by_api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_source_files_project_path_key" ON "repository_source_files" USING btree ("project_id","source_path");--> statement-breakpoint
CREATE INDEX "idx_repository_source_files_org_project" ON "repository_source_files" USING btree ("organization_id","project_id");--> statement-breakpoint
ALTER TABLE "translation_job_details" ADD CONSTRAINT "translation_job_details_source_file_version_id_repository_source_file_versions_id_fk" FOREIGN KEY ("source_file_version_id") REFERENCES "public"."repository_source_file_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_translation_job_details_source_file_version" ON "translation_job_details" USING btree ("source_file_version_id");