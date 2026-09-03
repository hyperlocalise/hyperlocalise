CREATE TYPE "public"."visual_workflow_node_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."visual_workflow_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."visual_workflow_run_trigger_source" AS ENUM('manual');--> statement-breakpoint
CREATE TABLE "visual_workflow_node_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"status" "visual_workflow_node_run_status" DEFAULT 'queued' NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visual_workflow_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"trigger_source" "visual_workflow_run_trigger_source" NOT NULL,
	"status" "visual_workflow_run_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visual_workflow_node_runs" ADD CONSTRAINT "visual_workflow_node_runs_run_id_visual_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."visual_workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_node_runs" ADD CONSTRAINT "visual_workflow_node_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD CONSTRAINT "visual_workflow_runs_visual_workflow_id_visual_workflows_id_fk" FOREIGN KEY ("visual_workflow_id") REFERENCES "public"."visual_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD CONSTRAINT "visual_workflow_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_node_runs_run" ON "visual_workflow_node_runs" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_visual_workflow_node_runs_run_node" ON "visual_workflow_node_runs" USING btree ("run_id","node_id");--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_runs_workflow_created" ON "visual_workflow_runs" USING btree ("visual_workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_runs_org_status" ON "visual_workflow_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_visual_workflow_runs_idempotency_key" ON "visual_workflow_runs" USING btree ("organization_id","visual_workflow_id","idempotency_key") WHERE "visual_workflow_runs"."idempotency_key" IS NOT NULL;