CREATE TYPE "public"."agent_task_run_event_type" AS ENUM('stage', 'tool_call', 'tool_result', 'warning', 'error', 'result');--> statement-breakpoint
CREATE TYPE "public"."agent_task_run_kind" AS ENUM('repository_context_lookup', 'qa_review', 'translation', 'writeback', 'automation');--> statement-breakpoint
CREATE TYPE "public"."agent_task_run_status" AS ENUM('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_task_run_surface" AS ENUM('cat', 'inbox', 'automation', 'provider_job', 'github', 'contentful');--> statement-breakpoint
CREATE TABLE "agent_task_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" "agent_task_run_event_type" NOT NULL,
	"stage" text,
	"message" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"surface" "agent_task_run_surface" NOT NULL,
	"kind" "agent_task_run_kind" NOT NULL,
	"status" "agent_task_run_status" DEFAULT 'queued' NOT NULL,
	"current_stage" text,
	"actor_user_id" uuid,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"idempotency_key" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_task_run_events" ADD CONSTRAINT "agent_task_run_events_run_id_agent_task_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_task_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_run_events" ADD CONSTRAINT "agent_task_run_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_runs" ADD CONSTRAINT "agent_task_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_runs" ADD CONSTRAINT "agent_task_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_task_run_events_run_sequence" ON "agent_task_run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_agent_task_run_events_org_run" ON "agent_task_run_events" USING btree ("organization_id","run_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_agent_task_runs_org_created" ON "agent_task_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_task_runs_org_status" ON "agent_task_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_agent_task_runs_org_project" ON "agent_task_runs" USING btree ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_task_runs_org_actor" ON "agent_task_runs" USING btree ("organization_id","actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_task_runs_active_idempotency" ON "agent_task_runs" USING btree ("organization_id","idempotency_key") WHERE "agent_task_runs"."idempotency_key" IS NOT NULL AND "agent_task_runs"."status" IN ('queued', 'running', 'waiting');