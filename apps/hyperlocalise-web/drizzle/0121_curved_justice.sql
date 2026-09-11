CREATE TYPE "public"."workspace_automation_kind" AS ENUM('agent', 'content_sync');--> statement-breakpoint
ALTER TABLE "workspace_automations" ADD COLUMN "kind" "workspace_automation_kind" DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_automations" ADD COLUMN "sync_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_automations" ADD COLUMN "sync_fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_automations_content_sync_fingerprint_key" ON "workspace_automations" USING btree ("organization_id","project_id","sync_fingerprint") WHERE "workspace_automations"."kind" = 'content_sync' AND "workspace_automations"."project_id" IS NOT NULL AND "workspace_automations"."sync_fingerprint" IS NOT NULL;