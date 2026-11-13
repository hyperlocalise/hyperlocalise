CREATE TABLE "webflow_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"display_name" text NOT NULL,
	"site_id" text NOT NULL,
	"collection_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pipes_workos_user_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"validation_status" text DEFAULT 'unvalidated' NOT NULL,
	"validation_message" text,
	"last_validated_at" timestamp with time zone,
	"masked_token_suffix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webflow_item_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"site_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"item_id" text NOT NULL,
	"slug" text NOT NULL,
	"source_hash" text NOT NULL,
	"last_imported_at" timestamp with time zone,
	"last_pushed_at" timestamp with time zone,
	"push_records" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webflow_sync_cursors" (
	"automation_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"watermark_updated_at" timestamp with time zone,
	"list_cursor" text,
	"last_reconcile_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webflow_connections" ADD CONSTRAINT "webflow_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webflow_connections" ADD CONSTRAINT "webflow_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webflow_connections" ADD CONSTRAINT "webflow_connections_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webflow_item_sync_states" ADD CONSTRAINT "webflow_item_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webflow_sync_cursors" ADD CONSTRAINT "webflow_sync_cursors_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webflow_sync_cursors" ADD CONSTRAINT "webflow_sync_cursors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webflow_connections_org_site_user_key" ON "webflow_connections" USING btree ("organization_id","site_id","pipes_workos_user_id");--> statement-breakpoint
CREATE INDEX "idx_webflow_connections_org" ON "webflow_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webflow_item_sync_states_automation_item_key" ON "webflow_item_sync_states" USING btree ("automation_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_webflow_item_sync_states_org" ON "webflow_item_sync_states" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_webflow_sync_cursors_org" ON "webflow_sync_cursors" USING btree ("organization_id");