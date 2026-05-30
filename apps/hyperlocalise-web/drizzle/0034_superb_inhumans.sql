CREATE TYPE "public"."github_repository_automation_commit_result_status" AS ENUM('skipped', 'passed', 'warning', 'failed', 'error');--> statement-breakpoint
CREATE TABLE "github_repository_automation_commit_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	"parent_commit_sha" text,
	"status" "github_repository_automation_commit_result_status" NOT NULL,
	"skip_reason" text,
	"changed_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hl_check_report" jsonb,
	"agent_summary" text,
	"suggested_fixes" jsonb,
	"log_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_repository_automation_jobs" ADD COLUMN "result_summary" jsonb;--> statement-breakpoint
ALTER TABLE "github_repository_automation_jobs" ADD COLUMN "github_check_run_id" bigint;--> statement-breakpoint
ALTER TABLE "github_repository_automation_commit_results" ADD CONSTRAINT "github_repository_automation_commit_results_job_id_github_repository_automation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."github_repository_automation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_repository_automation_commit_results_job_commit" ON "github_repository_automation_commit_results" USING btree ("job_id","commit_sha");--> statement-breakpoint
CREATE INDEX "idx_github_repository_automation_commit_results_job" ON "github_repository_automation_commit_results" USING btree ("job_id");