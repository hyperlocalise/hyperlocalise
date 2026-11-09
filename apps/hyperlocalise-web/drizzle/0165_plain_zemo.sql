CREATE TABLE "loops_email_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"resource_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_path" text NOT NULL,
	"email_message_id" text,
	"parent_id" text,
	"parent_name" text,
	"source_locale" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"source_content_hash" text NOT NULL,
	"source_lmx" text DEFAULT '' NOT NULL,
	"segment_count" text DEFAULT '0' NOT NULL,
	"variable_tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locale_copy_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locale_copy_names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_imported_at" timestamp with time zone,
	"last_pushed_at" timestamp with time zone,
	"last_push_content_hash" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loops_email_sync_states" ADD CONSTRAINT "loops_email_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loops_email_sync_states" ADD CONSTRAINT "loops_email_sync_states_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loops_email_sync_states" ADD CONSTRAINT "loops_email_sync_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loops_email_sync_org_automation_resource" ON "loops_email_sync_states" USING btree ("organization_id","automation_id","resource_kind","source_id");--> statement-breakpoint
CREATE INDEX "idx_loops_email_sync_automation" ON "loops_email_sync_states" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "idx_loops_email_sync_project" ON "loops_email_sync_states" USING btree ("project_id");