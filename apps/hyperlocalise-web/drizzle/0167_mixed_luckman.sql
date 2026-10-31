CREATE TABLE "iterable_connection_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workos_user_id" text NOT NULL,
	"region" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iterable_template_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"resource_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_path" text NOT NULL,
	"source_locale" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"source_content_hash" text NOT NULL,
	"editor_kind" text DEFAULT 'drag_and_drop' NOT NULL,
	"clone_template_id" text,
	"handlebars_tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_imported_at" timestamp with time zone,
	"last_pushed_at" timestamp with time zone,
	"last_push_content_hash" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_translation_hashes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iterable_connection_settings" ADD CONSTRAINT "iterable_connection_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iterable_template_sync_states" ADD CONSTRAINT "iterable_template_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iterable_template_sync_states" ADD CONSTRAINT "iterable_template_sync_states_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iterable_template_sync_states" ADD CONSTRAINT "iterable_template_sync_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "iterable_connection_settings_org_user_key" ON "iterable_connection_settings" USING btree ("organization_id","workos_user_id");--> statement-breakpoint
CREATE INDEX "idx_iterable_connection_settings_org" ON "iterable_connection_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iterable_template_sync_org_automation_resource" ON "iterable_template_sync_states" USING btree ("organization_id","automation_id","resource_kind","source_id");--> statement-breakpoint
CREATE INDEX "idx_iterable_template_sync_automation" ON "iterable_template_sync_states" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "idx_iterable_template_sync_project" ON "iterable_template_sync_states" USING btree ("project_id");