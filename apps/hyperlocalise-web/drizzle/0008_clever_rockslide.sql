CREATE TYPE "public"."activity_feed_actor_type" AS ENUM('user', 'agent', 'system', 'api_key');--> statement-breakpoint
CREATE TYPE "public"."activity_feed_event_category" AS ENUM('audit', 'agent', 'system', 'integration');--> statement-breakpoint
CREATE TABLE "activity_feed_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"team_id" uuid,
	"translation_job_id" text,
	"category" "activity_feed_event_category" NOT NULL,
	"actor_type" "activity_feed_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"actor_agent_id" text,
	"actor_api_key_id" uuid,
	"actor_display_name" text DEFAULT '' NOT NULL,
	"event_name" text NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"source_ref" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_feed_events_actor_user_required_for_user_type" CHECK ("activity_feed_events"."actor_type" <> 'user' OR "activity_feed_events"."actor_user_id" IS NOT NULL),
	CONSTRAINT "activity_feed_events_actor_agent_required_for_agent_type" CHECK ("activity_feed_events"."actor_type" <> 'agent' OR "activity_feed_events"."actor_agent_id" IS NOT NULL),
	CONSTRAINT "activity_feed_events_actor_api_key_required_for_api_key_type" CHECK ("activity_feed_events"."actor_type" <> 'api_key' OR "activity_feed_events"."actor_api_key_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "activity_feed_events" ADD CONSTRAINT "activity_feed_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed_events" ADD CONSTRAINT "activity_feed_events_project_id_translation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."translation_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed_events" ADD CONSTRAINT "activity_feed_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed_events" ADD CONSTRAINT "activity_feed_events_translation_job_id_translation_jobs_id_fk" FOREIGN KEY ("translation_job_id") REFERENCES "public"."translation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed_events" ADD CONSTRAINT "activity_feed_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed_events" ADD CONSTRAINT "activity_feed_events_actor_api_key_id_organization_llm_provider_credentials_id_fk" FOREIGN KEY ("actor_api_key_id") REFERENCES "public"."organization_llm_provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_feed_events_org_occurred_at" ON "activity_feed_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_activity_feed_events_project_occurred_at" ON "activity_feed_events" USING btree ("project_id","occurred_at") WHERE "activity_feed_events"."project_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_activity_feed_events_team_occurred_at" ON "activity_feed_events" USING btree ("team_id","occurred_at") WHERE "activity_feed_events"."team_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_activity_feed_events_translation_job_occurred_at" ON "activity_feed_events" USING btree ("translation_job_id","occurred_at") WHERE "activity_feed_events"."translation_job_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_activity_feed_events_actor_user_occurred_at" ON "activity_feed_events" USING btree ("actor_user_id","occurred_at") WHERE "activity_feed_events"."actor_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_activity_feed_events_category_occurred_at" ON "activity_feed_events" USING btree ("category","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_activity_feed_events_event_name_occurred_at" ON "activity_feed_events" USING btree ("event_name","occurred_at");