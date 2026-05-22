CREATE TYPE "public"."agent_run_kind" AS ENUM('translate', 'review', 'qa_fix', 'glossary_suggestion', 'comment_only');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"external_job_id" text NOT NULL,
	"external_task_id" text,
	"kind" "agent_run_kind" NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"actor_user_id" uuid,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hyperlocalise_job_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_hyperlocalise_job_id_jobs_id_fk" FOREIGN KEY ("hyperlocalise_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_runs_org_created" ON "agent_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_org_provider_job" ON "agent_runs" USING btree ("organization_id","provider_kind","external_job_id");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_org_provider_task" ON "agent_runs" USING btree ("organization_id","provider_kind","external_task_id");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_hyperlocalise_job" ON "agent_runs" USING btree ("hyperlocalise_job_id");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_actor" ON "agent_runs" USING btree ("actor_user_id");