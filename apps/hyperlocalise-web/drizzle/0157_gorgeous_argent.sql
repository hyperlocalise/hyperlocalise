CREATE TABLE "google_drive_file_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"folder_id" text NOT NULL,
	"drive_file_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"ingest_format" text NOT NULL,
	"source_path" text NOT NULL,
	"head_revision_id" text,
	"md5_checksum" text,
	"modified_time" timestamp with time zone,
	"source_content_hash" text NOT NULL,
	"translated_file_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locale_folder_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_imported_at" timestamp with time zone,
	"last_pushed_at" timestamp with time zone,
	"last_push_content_hash" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"skip_reason" text,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_drive_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by_workos_user_id" text NOT NULL,
	"drive_id" text,
	"folder_id" text NOT NULL,
	"name" text NOT NULL,
	"path_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_drive_sync_cursors" (
	"automation_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"page_tokens_by_drive_id" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_drive_file_sync_states" ADD CONSTRAINT "google_drive_file_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_file_sync_states" ADD CONSTRAINT "google_drive_file_sync_states_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_file_sync_states" ADD CONSTRAINT "google_drive_file_sync_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_folders" ADD CONSTRAINT "google_drive_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_sync_cursors" ADD CONSTRAINT "google_drive_sync_cursors_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_sync_cursors" ADD CONSTRAINT "google_drive_sync_cursors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_drive_file_sync_automation_file" ON "google_drive_file_sync_states" USING btree ("automation_id","drive_file_id");--> statement-breakpoint
CREATE INDEX "idx_google_drive_file_sync_automation" ON "google_drive_file_sync_states" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "idx_google_drive_file_sync_project" ON "google_drive_file_sync_states" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_drive_folders_org_folder" ON "google_drive_folders" USING btree ("organization_id","folder_id");--> statement-breakpoint
CREATE INDEX "idx_google_drive_folders_org" ON "google_drive_folders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_google_drive_sync_cursors_org" ON "google_drive_sync_cursors" USING btree ("organization_id");