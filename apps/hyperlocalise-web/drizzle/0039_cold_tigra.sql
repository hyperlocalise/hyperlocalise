ALTER TYPE "public"."workspace_automation_run_trigger_source" ADD VALUE 'contentful';--> statement-breakpoint
CREATE TABLE "contentful_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"display_name" text NOT NULL,
	"space_id" text NOT NULL,
	"environment_id" text DEFAULT 'master' NOT NULL,
	"source_locale" text NOT NULL,
	"target_locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"field_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"validation_status" text DEFAULT 'unvalidated' NOT NULL,
	"validation_message" text,
	"last_validated_at" timestamp with time zone,
	"encryption_algorithm" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"masked_token_suffix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contentful_translation_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"field_name" text,
	"locale" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_hash" text,
	"source_preview" text,
	"translation_preview" text,
	"qa_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contentful_translation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_automation_run_id" uuid,
	"webhook_event_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"entry_id" text NOT NULL,
	"content_type_id" text,
	"source_locale" text NOT NULL,
	"target_locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qa_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"writeback_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contentful_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider_event_id" text,
	"dedupe_key" text NOT NULL,
	"event_type" text NOT NULL,
	"entry_id" text,
	"content_type_id" text,
	"revision" integer,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"redacted_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contentful_webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"secret_hash" text NOT NULL,
	"provider_webhook_id" text,
	"last_delivery_id" text,
	"last_delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contentful_connections" ADD CONSTRAINT "contentful_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_connections" ADD CONSTRAINT "contentful_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_connections" ADD CONSTRAINT "contentful_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_connections" ADD CONSTRAINT "contentful_connections_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_translation_run_items" ADD CONSTRAINT "contentful_translation_run_items_run_id_contentful_translation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."contentful_translation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_translation_runs" ADD CONSTRAINT "contentful_translation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_translation_runs" ADD CONSTRAINT "contentful_translation_runs_connection_id_contentful_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."contentful_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_translation_runs" ADD CONSTRAINT "contentful_translation_runs_workspace_automation_run_id_workspace_automation_runs_id_fk" FOREIGN KEY ("workspace_automation_run_id") REFERENCES "public"."workspace_automation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_translation_runs" ADD CONSTRAINT "contentful_translation_runs_webhook_event_id_contentful_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."contentful_webhook_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_webhook_events" ADD CONSTRAINT "contentful_webhook_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_webhook_events" ADD CONSTRAINT "contentful_webhook_events_connection_id_contentful_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."contentful_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_webhook_events" ADD CONSTRAINT "contentful_webhook_events_subscription_id_contentful_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."contentful_webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_webhook_subscriptions" ADD CONSTRAINT "contentful_webhook_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contentful_webhook_subscriptions" ADD CONSTRAINT "contentful_webhook_subscriptions_connection_id_contentful_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."contentful_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contentful_connections_org_space_env_key" ON "contentful_connections" USING btree ("organization_id","space_id","environment_id");--> statement-breakpoint
CREATE INDEX "idx_contentful_connections_org" ON "contentful_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_contentful_connections_project" ON "contentful_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_contentful_translation_run_items_run" ON "contentful_translation_run_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_contentful_translation_run_items_status" ON "contentful_translation_run_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contentful_translation_runs_org_created" ON "contentful_translation_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contentful_translation_runs_connection" ON "contentful_translation_runs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_contentful_translation_runs_status" ON "contentful_translation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contentful_translation_runs_automation_run" ON "contentful_translation_runs" USING btree ("workspace_automation_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contentful_webhook_events_dedupe_key" ON "contentful_webhook_events" USING btree ("subscription_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_contentful_webhook_events_org_created" ON "contentful_webhook_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contentful_webhook_events_status" ON "contentful_webhook_events" USING btree ("processing_status");--> statement-breakpoint
CREATE UNIQUE INDEX "contentful_webhook_subscriptions_connection_key" ON "contentful_webhook_subscriptions" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_contentful_webhook_subscriptions_org" ON "contentful_webhook_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_contentful_webhook_subscriptions_provider_webhook" ON "contentful_webhook_subscriptions" USING btree ("provider_webhook_id");