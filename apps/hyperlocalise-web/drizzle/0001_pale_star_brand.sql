CREATE TYPE "public"."stored_file_role" AS ENUM('source', 'output', 'reference', 'asset');--> statement-breakpoint
CREATE TYPE "public"."stored_file_source_kind" AS ENUM('chat_upload', 'email_attachment', 'job_output', 'repository_file', 'tms_file');--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"created_by_user_id" uuid,
	"role" "stored_file_role" NOT NULL,
	"source_kind" "stored_file_source_kind" NOT NULL,
	"source_interaction_id" uuid,
	"source_job_id" text,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_url" text NOT NULL,
	"download_url" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"etag" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_source_interaction_id_interactions_id_fk" FOREIGN KEY ("source_interaction_id") REFERENCES "public"."interactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stored_files_storage_provider_key" ON "stored_files" USING btree ("storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "idx_stored_files_org_created_at" ON "stored_files" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_stored_files_project_created_at" ON "stored_files" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_stored_files_created_by_user_id" ON "stored_files" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_stored_files_source_interaction" ON "stored_files" USING btree ("source_interaction_id");--> statement-breakpoint
CREATE INDEX "idx_stored_files_source_job" ON "stored_files" USING btree ("source_job_id");--> statement-breakpoint
CREATE INDEX "idx_stored_files_org_role" ON "stored_files" USING btree ("organization_id","role");