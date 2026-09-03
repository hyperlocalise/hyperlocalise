ALTER TYPE "public"."visual_workflow_run_trigger_source" ADD VALUE 'scheduled';--> statement-breakpoint
ALTER TYPE "public"."visual_workflow_run_trigger_source" ADD VALUE 'github';--> statement-breakpoint
ALTER TYPE "public"."visual_workflow_run_trigger_source" ADD VALUE 'source_upload';--> statement-breakpoint
ALTER TABLE "visual_workflows" ADD COLUMN "trigger_fingerprint" text;--> statement-breakpoint
ALTER TABLE "visual_workflows" ADD COLUMN "next_run_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_visual_workflows_org_next_run_at" ON "visual_workflows" USING btree ("organization_id","next_run_at");--> statement-breakpoint
CREATE INDEX "idx_visual_workflows_org_trigger_fingerprint" ON "visual_workflows" USING btree ("organization_id","trigger_fingerprint");