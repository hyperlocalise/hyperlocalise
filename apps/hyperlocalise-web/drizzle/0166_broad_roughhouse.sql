CREATE TYPE "public"."visual_workflow_approval_reviewer_type" AS ENUM('user', 'team');--> statement-breakpoint
CREATE TYPE "public"."visual_workflow_approval_status" AS ENUM('pending', 'approved', 'rejected', 'changes_requested', 'timed_out', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."interaction_source" ADD VALUE 'workflow_approval';--> statement-breakpoint
CREATE TABLE "visual_workflow_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"node_run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"reviewer_type" "visual_workflow_approval_reviewer_type" NOT NULL,
	"reviewer_id" text NOT NULL,
	"status" "visual_workflow_approval_status" DEFAULT 'pending' NOT NULL,
	"interaction_id" uuid,
	"encrypted_context" jsonb NOT NULL,
	"decided_by_user_id" uuid,
	"comment_reference" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visual_workflow_approval_requests" ADD CONSTRAINT "visual_workflow_approval_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_approval_requests" ADD CONSTRAINT "visual_workflow_approval_requests_run_id_visual_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."visual_workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_approval_requests" ADD CONSTRAINT "visual_workflow_approval_requests_node_run_id_visual_workflow_node_runs_id_fk" FOREIGN KEY ("node_run_id") REFERENCES "public"."visual_workflow_node_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_approval_requests" ADD CONSTRAINT "visual_workflow_approval_requests_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_approval_requests" ADD CONSTRAINT "visual_workflow_approval_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visual_workflow_approval_requests_node_run_key" ON "visual_workflow_approval_requests" USING btree ("node_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visual_workflow_approval_requests_interaction_key" ON "visual_workflow_approval_requests" USING btree ("interaction_id") WHERE "visual_workflow_approval_requests"."interaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_approval_requests_run" ON "visual_workflow_approval_requests" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_approval_requests_org_status" ON "visual_workflow_approval_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_approval_requests_reviewer" ON "visual_workflow_approval_requests" USING btree ("organization_id","reviewer_type","reviewer_id","status");--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_approval_requests_expiry" ON "visual_workflow_approval_requests" USING btree ("status","expires_at");