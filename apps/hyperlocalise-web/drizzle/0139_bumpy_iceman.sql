CREATE TABLE "intercom_article_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"intercom_app_id" text,
	"help_center_id" text NOT NULL,
	"article_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_locale" text NOT NULL,
	"intercom_default_locale" text,
	"source_updated_at" timestamp with time zone,
	"source_content_hash" text NOT NULL,
	"last_imported_at" timestamp with time zone,
	"last_pushed_at" timestamp with time zone,
	"last_push_content_hash" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intercom_sync_cursors" (
	"automation_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"watermark_updated_at" timestamp with time zone,
	"list_cursor" text,
	"last_reconcile_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intercom_article_sync_states" ADD CONSTRAINT "intercom_article_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercom_article_sync_states" ADD CONSTRAINT "intercom_article_sync_states_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercom_article_sync_states" ADD CONSTRAINT "intercom_article_sync_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercom_sync_cursors" ADD CONSTRAINT "intercom_sync_cursors_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercom_sync_cursors" ADD CONSTRAINT "intercom_sync_cursors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intercom_article_sync_org_automation_article" ON "intercom_article_sync_states" USING btree ("organization_id","automation_id","article_id");--> statement-breakpoint
CREATE INDEX "idx_intercom_article_sync_automation" ON "intercom_article_sync_states" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "idx_intercom_article_sync_project" ON "intercom_article_sync_states" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_intercom_sync_cursors_org" ON "intercom_sync_cursors" USING btree ("organization_id");