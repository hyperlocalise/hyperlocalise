ALTER TABLE "visual_workflow_runs" ADD COLUMN "trace_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "parent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "parent_node_id" text;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD CONSTRAINT "visual_workflow_runs_parent_run_id_visual_workflow_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."visual_workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_runs_parent" ON "visual_workflow_runs" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_runs_trace" ON "visual_workflow_runs" USING btree ("organization_id","trace_id");