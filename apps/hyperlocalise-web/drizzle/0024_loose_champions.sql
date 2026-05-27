CREATE TYPE "public"."provider_sync_intent_cause" AS ENUM('webhook', 'manual', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."provider_sync_intent_status" AS ENUM('pending', 'running', 'retryable', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "provider_sync_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_credential_id" uuid,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"project_id" text,
	"sync_kind" "provider_sync_run_kind" NOT NULL,
	"resource_id" text,
	"resource_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cause" "provider_sync_intent_cause" NOT NULL,
	"event_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "provider_sync_intent_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"lease_key" text NOT NULL,
	"leased_until" timestamp with time zone,
	"leased_by" text,
	"next_attempt_at" timestamp with time zone,
	"provider_sync_run_id" uuid,
	"last_error" text,
	"error_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "provider_sync_intents" ADD CONSTRAINT "provider_sync_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_intents" ADD CONSTRAINT "provider_sync_intents_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_intents" ADD CONSTRAINT "provider_sync_intents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_intents" ADD CONSTRAINT "provider_sync_intents_provider_sync_run_id_provider_sync_runs_id_fk" FOREIGN KEY ("provider_sync_run_id") REFERENCES "public"."provider_sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_provider_sync_intents_org_created" ON "provider_sync_intents" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_intents_status_next_attempt" ON "provider_sync_intents" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_intents_lease_key" ON "provider_sync_intents" USING btree ("lease_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_sync_intents_lease_key_active_key" ON "provider_sync_intents" USING btree ("lease_key") WHERE "provider_sync_intents"."status" in ('pending', 'running', 'retryable');--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_provider_sync_intent_id_provider_sync_intents_id_fk" FOREIGN KEY ("provider_sync_intent_id") REFERENCES "public"."provider_sync_intents"("id") ON DELETE set null ON UPDATE no action;