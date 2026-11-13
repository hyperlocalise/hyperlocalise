CREATE TABLE "sanity_document_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"sanity_project_id" text NOT NULL,
	"dataset" text NOT NULL,
	"document_type" text NOT NULL,
	"document_id" text NOT NULL,
	"i18n_mode" text NOT NULL,
	"source_path" text NOT NULL,
	"source_locale" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"source_content_hash" text NOT NULL,
	"translated_document_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_imported_at" timestamp with time zone,
	"last_pushed_at" timestamp with time zone,
	"last_push_content_hash" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_translation_hashes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanity_sync_cursors" (
	"automation_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"watermark_updated_at" timestamp with time zone,
	"list_cursor" text,
	"last_reconcile_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sanity_document_sync_states" ADD CONSTRAINT "sanity_document_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_document_sync_states" ADD CONSTRAINT "sanity_document_sync_states_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_document_sync_states" ADD CONSTRAINT "sanity_document_sync_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_sync_cursors" ADD CONSTRAINT "sanity_sync_cursors_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_sync_cursors" ADD CONSTRAINT "sanity_sync_cursors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sanity_document_sync_org_automation_document" ON "sanity_document_sync_states" USING btree ("organization_id","automation_id","document_id");--> statement-breakpoint
CREATE INDEX "idx_sanity_document_sync_automation" ON "sanity_document_sync_states" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "idx_sanity_document_sync_project" ON "sanity_document_sync_states" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_sanity_sync_cursors_org" ON "sanity_sync_cursors" USING btree ("organization_id");