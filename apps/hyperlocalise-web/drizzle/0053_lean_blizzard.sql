CREATE TABLE "workspace_resource_usage_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"feature_id" text NOT NULL,
	"synced_usage" integer DEFAULT 0 NOT NULL,
	"sync_sequence" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_sync_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_resource_usage_sync_states" ADD CONSTRAINT "workspace_resource_usage_sync_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_resource_usage_sync_states_org_feature_key" ON "workspace_resource_usage_sync_states" USING btree ("organization_id","feature_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_resource_usage_sync_states_org" ON "workspace_resource_usage_sync_states" USING btree ("organization_id");