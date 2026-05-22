CREATE TYPE "public"."provider_sync_run_kind" AS ENUM('project_scan', 'file_key_scan', 'job_task_scan', 'context_scan', 'tm_scan', 'glossary_scan', 'pull_content', 'push_translations', 'webhook', 'health_check');--> statement-breakpoint
CREATE TYPE "public"."provider_sync_run_status" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "provider_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_credential_id" uuid,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"kind" "provider_sync_run_kind" NOT NULL,
	"status" "provider_sync_run_status" DEFAULT 'running' NOT NULL,
	"project_id" text,
	"external_project_id" text,
	"resource_type" text,
	"resource_id" text,
	"external_resource_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"error_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_sync_runs" ADD CONSTRAINT "provider_sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_runs" ADD CONSTRAINT "provider_sync_runs_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_runs" ADD CONSTRAINT "provider_sync_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_provider_sync_runs_org_started" ON "provider_sync_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_runs_org_provider_started" ON "provider_sync_runs" USING btree ("organization_id","provider_kind","started_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_runs_org_project_started" ON "provider_sync_runs" USING btree ("organization_id","project_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_runs_org_resource_started" ON "provider_sync_runs" USING btree ("organization_id","resource_type","resource_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_runs_status" ON "provider_sync_runs" USING btree ("status");