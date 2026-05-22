CREATE TYPE "public"."repo_tms_mutation_log_action" AS ENUM('upload_sources', 'apply_fixes', 'commit_changes', 'push_to_branch', 'tms_mutate');--> statement-breakpoint
CREATE TYPE "public"."repo_tms_mutation_log_status" AS ENUM('pending', 'approved', 'denied', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "repo_tms_mutation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"workflow_run_id" text,
	"task_id" text NOT NULL,
	"actor" jsonb NOT NULL,
	"action" "repo_tms_mutation_log_action" NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"status" "repo_tms_mutation_log_status" DEFAULT 'pending' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_tms_mutation_logs" ADD CONSTRAINT "repo_tms_mutation_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_tms_mutation_logs" ADD CONSTRAINT "repo_tms_mutation_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_repo_tms_mutation_logs_org" ON "repo_tms_mutation_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_repo_tms_mutation_logs_task" ON "repo_tms_mutation_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_repo_tms_mutation_logs_workflow_run" ON "repo_tms_mutation_logs" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_repo_tms_mutation_logs_created_at" ON "repo_tms_mutation_logs" USING btree ("created_at");