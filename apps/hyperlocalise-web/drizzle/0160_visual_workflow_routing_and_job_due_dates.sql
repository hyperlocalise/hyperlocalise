ALTER TYPE "public"."visual_workflow_run_trigger_source" ADD VALUE 'webhook';--> statement-breakpoint
CREATE TABLE "visual_workflow_assignment_cursors" (
	"workflow_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"last_assignee_id" text,
	"last_step_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visual_workflow_assignment_cursors_workflow_id_node_id_rule_id_pk" PRIMARY KEY("workflow_id","node_id","rule_id")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visual_workflow_assignment_cursors" ADD CONSTRAINT "visual_workflow_assignment_cursors_workflow_id_visual_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."visual_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_org_due_at" ON "jobs" USING btree ("organization_id","due_at");