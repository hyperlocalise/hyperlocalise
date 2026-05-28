CREATE TYPE "public"."usage_event_status" AS ENUM('reserved', 'succeeded', 'rejected', 'tracking_pending', 'tracking_succeeded', 'tracking_failed');--> statement-breakpoint
CREATE TYPE "public"."usage_feature_id" AS ENUM('translation_jobs', 'translation_units', 'source_characters', 'ai_tokens', 'api_requests', 'agent_runs');--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"feature_id" "usage_feature_id" NOT NULL,
	"status" "usage_event_status" DEFAULT 'reserved' NOT NULL,
	"operation_key" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" uuid,
	"api_key_id" uuid,
	"job_id" text,
	"interaction_id" uuid,
	"autumn_tracked_at" timestamp with time zone,
	"autumn_track_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_api_key_id_organization_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."organization_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_operation_key_key" ON "usage_events" USING btree ("operation_key");--> statement-breakpoint
CREATE INDEX "idx_usage_events_org_created_at" ON "usage_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_feature_status" ON "usage_events" USING btree ("feature_id","status");--> statement-breakpoint
CREATE INDEX "idx_usage_events_job_id" ON "usage_events" USING btree ("job_id");