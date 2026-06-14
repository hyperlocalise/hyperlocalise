CREATE TABLE "project_file_string_repository_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"source_path" text NOT NULL,
	"string_key" text NOT NULL,
	"repository_full_name" text NOT NULL,
	"source_text_hash" text NOT NULL,
	"summary" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_file_string_repository_contexts_summary_length_check" CHECK (char_length("project_file_string_repository_contexts"."summary") <= 16384)
);
--> statement-breakpoint
ALTER TABLE "project_file_string_repository_contexts" ADD CONSTRAINT "project_file_string_repository_contexts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_string_repository_contexts" ADD CONSTRAINT "project_file_string_repository_contexts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_string_repository_contexts" ADD CONSTRAINT "project_file_string_repository_contexts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_file_string_repository_contexts_lookup" ON "project_file_string_repository_contexts" USING btree ("organization_id","project_id","source_path","string_key","repository_full_name");--> statement-breakpoint
CREATE INDEX "idx_project_file_string_repository_contexts_file" ON "project_file_string_repository_contexts" USING btree ("organization_id","project_id","source_path");