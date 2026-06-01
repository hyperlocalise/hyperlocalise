CREATE TYPE "public"."workspace_automation_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."workspace_automation_run_trigger_source" AS ENUM('manual', 'scheduled', 'github');--> statement-breakpoint
CREATE TYPE "public"."workspace_automation_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "workspace_automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"trigger_source" "workspace_automation_run_trigger_source" NOT NULL,
	"status" "workspace_automation_run_status" DEFAULT 'queued' NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"github_repository_automation_job_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_user_id" uuid,
	"status" "workspace_automation_status" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"github_installation_repository_id" uuid,
	"repository_target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tool_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_automation_runs" ADD CONSTRAINT "workspace_automation_runs_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_runs" ADD CONSTRAINT "workspace_automation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_runs" ADD CONSTRAINT "workspace_automation_runs_github_repository_automation_job_id_github_repository_automation_jobs_id_fk" FOREIGN KEY ("github_repository_automation_job_id") REFERENCES "public"."github_repository_automation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automations" ADD CONSTRAINT "workspace_automations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automations" ADD CONSTRAINT "workspace_automations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automations" ADD CONSTRAINT "workspace_automations_github_installation_repository_id_github_installation_repositories_id_fk" FOREIGN KEY ("github_installation_repository_id") REFERENCES "public"."github_installation_repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_automation_runs_automation_created" ON "workspace_automation_runs" USING btree ("automation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_workspace_automation_runs_org_status" ON "workspace_automation_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_workspace_automation_runs_github_job" ON "workspace_automation_runs" USING btree ("github_repository_automation_job_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_automations_org_status" ON "workspace_automations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_workspace_automations_org_next_run" ON "workspace_automations" USING btree ("organization_id","next_run_at");--> statement-breakpoint
CREATE INDEX "idx_workspace_automations_github_repo" ON "workspace_automations" USING btree ("github_installation_repository_id");