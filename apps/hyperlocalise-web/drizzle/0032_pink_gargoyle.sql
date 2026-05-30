CREATE TYPE "public"."github_repository_automation_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "github_repository_automation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_repository_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"config_version" integer NOT NULL,
	"trigger_mode" text NOT NULL,
	"status" "github_repository_automation_job_status" DEFAULT 'queued' NOT NULL,
	"skip_reason" text,
	"trigger_branch" text,
	"commit_before" text,
	"commit_after" text,
	"workflows" jsonb DEFAULT '{"pushSource":false,"pullTranslations":false,"validation":false}'::jsonb NOT NULL,
	"github_delivery_id" text,
	"scheduled_run_at" timestamp with time zone,
	"workflow_run_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "github_repository_automation_jobs" ADD CONSTRAINT "github_repository_automation_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository_automation_jobs" ADD CONSTRAINT "github_repository_automation_jobs_github_installation_repository_id_github_installation_repositories_id_fk" FOREIGN KEY ("github_installation_repository_id") REFERENCES "public"."github_installation_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_repository_automation_jobs_idempotency_key" ON "github_repository_automation_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_github_repository_automation_jobs_org_created" ON "github_repository_automation_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_github_repository_automation_jobs_repo_created" ON "github_repository_automation_jobs" USING btree ("github_installation_repository_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_github_repository_automation_jobs_status" ON "github_repository_automation_jobs" USING btree ("status");