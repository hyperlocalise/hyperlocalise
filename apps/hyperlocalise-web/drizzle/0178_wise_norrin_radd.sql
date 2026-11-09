CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
ALTER TYPE "public"."visual_workflow_run_trigger_source" ADD VALUE 'job_changed';--> statement-breakpoint
CREATE TABLE "job_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"project_id" text,
	"kind" "job_kind" NOT NULL,
	"type" text NOT NULL,
	"from_status" "job_status",
	"to_status" "job_status" NOT NULL,
	"assignee_type" "job_assignee_type",
	"occurred_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"claimed_until" timestamp with time zone,
	"claim_attempts" integer DEFAULT 0 NOT NULL,
	"dispatched_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_until" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_response_status" integer,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"project_id" text,
	"secret" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"disabled_at" timestamp with time zone,
	"disabled_reason" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_change_events" ADD CONSTRAINT "job_change_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_job_change_events_pending" ON "job_change_events" USING btree ("occurred_at") WHERE "job_change_events"."dispatched_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_job_change_events_org_occurred_at" ON "job_change_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_job_change_events_job" ON "job_change_events" USING btree ("job_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_webhook_deliveries_endpoint_event" ON "webhook_deliveries" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_due" ON "webhook_deliveries" USING btree ("next_attempt_at") WHERE "webhook_deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_endpoint_created_at" ON "webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_endpoints_org" ON "webhook_endpoints" USING btree ("organization_id");