CREATE TABLE "project_image_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"repository_source_file_id" uuid,
	"external_tms_file_id" uuid,
	"source_path" text NOT NULL,
	"target_locale" text NOT NULL,
	"stored_file_id" text,
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
ALTER TABLE "project_image_variants" ADD CONSTRAINT "project_image_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image_variants" ADD CONSTRAINT "project_image_variants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image_variants" ADD CONSTRAINT "project_image_variants_repository_source_file_id_repository_source_files_id_fk" FOREIGN KEY ("repository_source_file_id") REFERENCES "public"."repository_source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image_variants" ADD CONSTRAINT "project_image_variants_external_tms_file_id_external_tms_files_id_fk" FOREIGN KEY ("external_tms_file_id") REFERENCES "public"."external_tms_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image_variants" ADD CONSTRAINT "project_image_variants_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image_variants" ADD CONSTRAINT "project_image_variants_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image_variants" ADD CONSTRAINT "project_image_variants_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_image_variants_project_path_locale" ON "project_image_variants" USING btree ("project_id","source_path","target_locale");--> statement-breakpoint
CREATE INDEX "idx_project_image_variants_org_project" ON "project_image_variants" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_image_variants_repo_file" ON "project_image_variants" USING btree ("repository_source_file_id");--> statement-breakpoint
CREATE INDEX "idx_project_image_variants_external_file" ON "project_image_variants" USING btree ("external_tms_file_id");--> statement-breakpoint
CREATE INDEX "idx_project_image_variants_status" ON "project_image_variants" USING btree ("project_id","status");