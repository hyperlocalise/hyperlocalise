CREATE TYPE "public"."job_kind" AS ENUM('translation', 'research', 'brief');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"created_by_user_id" uuid,
	"kind" "job_kind" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input_payload" jsonb NOT NULL,
	"outcome_payload" jsonb,
	"last_error" text,
	"workflow_run_id" text,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "translation_job_details" (
	"job_id" text PRIMARY KEY NOT NULL,
	"type" "translation_job_type" NOT NULL,
	"outcome_kind" "translation_job_outcome_kind"
);
--> statement-breakpoint
ALTER TABLE "translation_jobs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "translation_jobs" CASCADE;--> statement-breakpoint
DROP INDEX "idx_conversations_source_thread";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_translation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."translation_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_job_details" ADD CONSTRAINT "translation_job_details_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_org_created_at" ON "jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_project_created_at" ON "jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_created_by_user_id" ON "jobs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_kind_status" ON "jobs" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "idx_jobs_workflow_run_id" ON "jobs" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_conversation" ON "jobs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_translation_job_details_type" ON "translation_job_details" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_translation_job_details_outcome_kind" ON "translation_job_details" USING btree ("outcome_kind");--> statement-breakpoint
DROP TYPE "public"."translation_job_status";