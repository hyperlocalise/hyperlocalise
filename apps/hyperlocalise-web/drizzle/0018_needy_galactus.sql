CREATE TABLE "external_tms_file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"external_tms_file_id" uuid NOT NULL,
	"source_path" text NOT NULL,
	"revision" text,
	"source_hash" text,
	"stored_file_id" text,
	"format" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_tms_file_versions" ADD CONSTRAINT "external_tms_file_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_tms_file_versions" ADD CONSTRAINT "external_tms_file_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_tms_file_versions" ADD CONSTRAINT "external_tms_file_versions_external_tms_file_id_external_tms_files_id_fk" FOREIGN KEY ("external_tms_file_id") REFERENCES "public"."external_tms_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_tms_file_versions" ADD CONSTRAINT "external_tms_file_versions_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_external_tms_file_versions_file_captured" ON "external_tms_file_versions" USING btree ("external_tms_file_id","captured_at");--> statement-breakpoint
CREATE INDEX "idx_external_tms_file_versions_org_project_path" ON "external_tms_file_versions" USING btree ("organization_id","project_id","source_path");