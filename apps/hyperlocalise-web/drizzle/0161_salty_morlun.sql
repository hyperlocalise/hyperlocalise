CREATE TABLE "visual_workflow_assignment_picks" (
	"workflow_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"step_key" text NOT NULL,
	"assignee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visual_workflow_assignment_picks_workflow_id_node_id_rule_id_step_key_pk" PRIMARY KEY("workflow_id","node_id","rule_id","step_key")
);
--> statement-breakpoint
ALTER TABLE "visual_workflow_assignment_picks" ADD CONSTRAINT "visual_workflow_assignment_picks_workflow_id_visual_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."visual_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_assignment_cursors" DROP COLUMN "last_step_key";