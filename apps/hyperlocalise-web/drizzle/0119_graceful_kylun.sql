ALTER TYPE "public"."visual_workflow_node_run_status" ADD VALUE 'blocked';--> statement-breakpoint
ALTER TYPE "public"."visual_workflow_node_run_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."visual_workflow_node_run_status" ADD VALUE 'handled_error';--> statement-breakpoint
ALTER TYPE "public"."visual_workflow_node_run_status" ADD VALUE 'needs_attention';--> statement-breakpoint
ALTER TYPE "public"."visual_workflow_run_status" ADD VALUE 'needs_attention';--> statement-breakpoint
CREATE TABLE "visual_workflow_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"encrypted_value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_workflow_outbox" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_visual_workflow_node_runs_run_node";--> statement-breakpoint
ALTER TABLE "visual_workflows" ADD COLUMN "published_definition" jsonb;--> statement-breakpoint
ALTER TABLE "visual_workflows" ADD COLUMN "published_version" integer;--> statement-breakpoint
ALTER TABLE "visual_workflows" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "visual_workflow_node_runs" ADD COLUMN "iteration" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "visual_workflow_node_runs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "visual_workflow_node_runs" ADD COLUMN "encrypted_output" jsonb;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "encrypted_payload" jsonb;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visual_workflow_runs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visual_workflow_credentials" ADD CONSTRAINT "visual_workflow_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_outbox" ADD CONSTRAINT "visual_workflow_outbox_run_id_visual_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."visual_workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_outbox" ADD CONSTRAINT "visual_workflow_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_outbox" ADD CONSTRAINT "visual_workflow_outbox_workflow_id_visual_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."visual_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_versions" ADD CONSTRAINT "visual_workflow_versions_workflow_id_visual_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."visual_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_workflow_versions" ADD CONSTRAINT "visual_workflow_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visual_workflow_version_unique" ON "visual_workflow_versions" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_visual_workflow_node_runs_run_node" ON "visual_workflow_node_runs" USING btree ("run_id","node_id","iteration","attempt");