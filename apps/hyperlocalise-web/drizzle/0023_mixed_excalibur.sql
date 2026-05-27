CREATE TYPE "public"."provider_webhook_event_processing_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."provider_webhook_subscription_status" AS ENUM('active', 'disabled', 'error');--> statement-breakpoint
CREATE TABLE "provider_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"project_id" text,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"external_resource_id" text,
	"redacted_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processing_status" "provider_webhook_event_processing_status" DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"provider_sync_intent_id" uuid,
	"provider_sync_run_id" uuid,
	"error_message" text,
	"error_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_credential_id" uuid NOT NULL,
	"project_id" text,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"provider_webhook_id" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"secret_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"webhook_secret_ciphertext" text,
	"webhook_secret_iv" text,
	"webhook_secret_auth_tag" text,
	"webhook_secret_key_version" integer,
	"subscribed_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "provider_webhook_subscription_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_subscription_id_provider_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."provider_webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_provider_sync_run_id_provider_sync_runs_id_fk" FOREIGN KEY ("provider_sync_run_id") REFERENCES "public"."provider_sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ADD CONSTRAINT "provider_webhook_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ADD CONSTRAINT "provider_webhook_subscriptions_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ADD CONSTRAINT "provider_webhook_subscriptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_webhook_events_subscription_provider_event_key" ON "provider_webhook_events" USING btree ("subscription_id","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_webhook_events_subscription_dedupe_key" ON "provider_webhook_events" USING btree ("subscription_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_events_org_received" ON "provider_webhook_events" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_events_subscription_received" ON "provider_webhook_events" USING btree ("subscription_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_events_pending_retry" ON "provider_webhook_events" USING btree ("processing_status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_events_sync_run" ON "provider_webhook_events" USING btree ("provider_sync_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_webhook_subscriptions_credential_webhook_key" ON "provider_webhook_subscriptions" USING btree ("provider_credential_id","provider_webhook_id");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_subscriptions_org" ON "provider_webhook_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_subscriptions_credential" ON "provider_webhook_subscriptions" USING btree ("provider_credential_id");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_subscriptions_credential_project" ON "provider_webhook_subscriptions" USING btree ("provider_credential_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_provider_webhook_subscriptions_org_status" ON "provider_webhook_subscriptions" USING btree ("organization_id","status");