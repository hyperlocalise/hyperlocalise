ALTER TABLE "visual_workflows" ADD COLUMN "encrypted_test_setup" jsonb;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "real_node_ids" jsonb;