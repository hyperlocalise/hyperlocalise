CREATE TABLE "project_content_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"triggered_by_user_id" uuid,
	"summary" jsonb,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_content_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"sync_config" jsonb NOT NULL,
	"schedule" text DEFAULT 'manual' NOT NULL,
	"next_run_at" timestamp with time zone,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "gitlab_connections_organization_key";--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ADD COLUMN "sync_report" jsonb;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD COLUMN "hidden_by_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_content_sync_runs" ADD CONSTRAINT "project_content_sync_runs_sync_id_project_content_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."project_content_syncs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_content_sync_runs" ADD CONSTRAINT "project_content_sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_content_sync_runs" ADD CONSTRAINT "project_content_sync_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_content_sync_runs" ADD CONSTRAINT "project_content_sync_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_content_syncs" ADD CONSTRAINT "project_content_syncs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_content_syncs" ADD CONSTRAINT "project_content_syncs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_content_syncs" ADD CONSTRAINT "project_content_syncs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_content_sync_runs_sync_created" ON "project_content_sync_runs" USING btree ("sync_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_content_sync_runs_status_started" ON "project_content_sync_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_content_syncs_project_key" ON "project_content_syncs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_content_syncs_next_run" ON "project_content_syncs" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "idx_gitlab_connections_org" ON "gitlab_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gitlab_connections_default_key" ON "gitlab_connections" USING btree ("organization_id") WHERE "gitlab_connections"."is_default";